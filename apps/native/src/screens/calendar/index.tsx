/**
 * 달력 화면 — 앱의 첫 화면.
 *
 * 사용처: 달력 탭(app/(tabs)/(calendar)/index.tsx).
 *
 * 그룹에 속해 있으면 스크롤 달력과 하루 패널을, 아직 그룹이 없으면 참여 안내를
 * 보여준다. 날짜를 고르면 그날 기준으로 휴가 등록 시트가 열린다.
 * 웹의 CalendarPage와 같은 정보를 같은 규칙으로 보여준다.
 *
 * ## 창 폭에 따라 하루 상세가 사는 곳이 달라진다
 *
 * 좁은 창(compact)에서는 지금까지처럼 네이티브 바텀시트가 올라온다. 한 손으로
 * 잡은 화면에서는 그게 가장 빠르고, 달력을 잠깐 덮는 대가도 크지 않다.
 *
 * 넓은 창(medium 이상)에서는 오른쪽 인스펙터에 붙박이로 둔다. 시트로 iPad
 * 화면의 3/4을 덮어 놓고 계획을 짜는 건 말이 안 된다 — 달력을 보면서 그날의
 * 명단·제한 여부를 읽고 바로 등록까지 가는 게 이 화면의 전부다. 아무 날도 고르지
 * 않았을 때는 빈 칸 대신 오늘·잔여·주기·다음 일정·붐비는 날 요약을 둔다
 * (overview-panel.tsx).
 *
 * ## 모달이 겹치지 않게 지키는 규칙
 *
 * iOS는 한 화면에 모달을 하나만 띄운다. 그래서 바텀시트는 세 조건이 모두 맞을
 * 때만 뜬다 — 좁은 창이고, 고른 날짜가 있고, 등록 폼이 떠 있지 않을 때. 특히
 * 마지막 조건이 없으면 넓은 창에서 폼을 연 채 창을 좁혔을 때 시트와 폼이 동시에
 * 뜨려다 UIKit이 표시를 거부하고, 그 상태가 굳어 화면 전체가 먹통이 된다.
 */

import { WEEKDAYS } from "@leave/shared/calendar";
import { todayInSeoul, type ISODate } from "@leave/shared/dates";
import { type OutingKind } from "@leave/shared/leave";
import { type OutingConfig } from "@leave/shared/outing";
import {
  cycleForDisplay,
  cycleUsedDays,
  regularOvernightPooledRemaining,
  firstGrantDate,
} from "@leave/shared/regular-overnight";
import { useNetInfo } from "@react-native-community/netinfo";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  balanceCountedSegments,
  buildMyLeaveDayMap,
  summarizeHoldings,
  useCalendar,
  useLeaveBalances,
  useMe,
  useMyLeaves,
  usePersonalEvents,
  type Calendar,
  type MyLeave,
} from "@leave/client";
import { SplitPane, useWindowSizeClass } from "@/adaptive";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { LiquidGlassSurface } from "@/components/liquid-glass-surface";
import {
  CalendarScroll,
  type CalendarScrollHandle,
} from "@/components/calendar-scroll";
import { LazyLeaveFormModal } from "@/components/lazy-leave-form-modal";
import { NativeBottomSheet } from "@/components/native-bottom-sheet";
import {
  SHEET_EXTENDS_UNDER_BOTTOM_INSET,
  SHEET_GRABBER_INSET,
  SheetScaffold,
} from "@/components/sheet-scaffold";
import { makeStyles, spacing, useColors } from "@/theme";
import {
  CYCLE_BANNER_HEIGHT,
  CycleBanner,
  FirstGrantBanner,
} from "./cycle-banner";
import { DayPanel } from "./day-panel";
import { CalendarOverviewPanel } from "./overview-panel";
import { useLeaveDrag } from "./use-leave-drag";

/** 헤더 아래 요일 행 높이. */
const WEEK_ROW_HEIGHT = 32;
/**
 * 헤더 툴바와 글래스 스트립 첫 줄 사이 숨 틈. 툴바 버튼과 요일 행이 맞닿아 한
 * 덩어리로 보이는 걸 막는다. 스트립 높이(glassStripHeight)에도 함께 더해야
 * 달력 스크롤의 상단 인셋이 어긋나지 않는다.
 */
const STRIP_TOP_GAP = spacing.xs;
/** 동기화 시각 한 줄. 아래 styles.syncStatus의 height와 같아야 한다. */
const STATUS_ROW_HEIGHT = 20;
const NATIVE_HEADER_HEIGHT = 44;

const LAST_UPDATED_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 달력에서 시작할 수 있는 이동. 좁은 창에서는 넷 다 날짜 시트가 닫히기를 기다려야
 * 하므로(iOS 단일 모달 규칙), 한 타입으로 묶어 대기·수행을 한 자리에서 다룬다.
 */
type CalendarIntent =
  | { kind: "form"; date: ISODate }
  | { kind: "leave"; leaveId: string }
  | { kind: "personalEvent"; date: ISODate }
  | { kind: "personalEvents" }
  | { kind: "unitEvent"; date: ISODate };

export function CalendarScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { sizeClass, isCompact, height: windowHeight } = useWindowSizeClass();
  const me = useMe();
  const netInfo = useNetInfo();
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  // 폼을 열었는지와 폼의 시작일을 한 값으로 둔다. 날짜 시트를 닫으면서 열어야
  // 하기 때문에 시작일을 selectedDate와 따로 기억해야 한다.
  const [formDate, setFormDate] = useState<ISODate | null>(null);
  const [editingLeave, setEditingLeave] = useState<MyLeave | null>(null);
  /**
   * 시트가 닫히기를 기다리는 다음 행동. 아래 openAfterSheet 주석 참고.
   *
   * 폼과 상세를 각각 다른 ref에 두면 둘이 동시에 차 있을 수 있고, 그러면 onClosed가
   * 무엇을 해야 하는지가 "누가 먼저 지웠나"에 달린다. 한 값으로 두면 애초에 둘이
   * 동시에 존재할 수 없다 — 새 의도가 이전 의도를 덮어쓴다.
   */
  const pendingAfterSheet = useRef<CalendarIntent | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<CalendarScrollHandle>(null);

  // `me`에는 이메일 등 계정 정보가 있어 디스크에 저장하지 않는다. 완전 오프라인
  // 재실행에서는 이미 허용 목록으로 복원된 달력 캐시에서 비식별 그룹 요약만 꺼낸다.
  const cachedCalendar = useMemo(() => {
    const candidates = queryClient
      .getQueryCache()
      .findAll({ queryKey: ["calendar"] })
      .filter(
        (query): query is typeof query & { state: { data: Calendar } } =>
          query.state.status === "success" && query.state.data != null,
      )
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    return candidates[0]?.state.data ?? null;
    // isRestoring은 값으로 읽지 않지만 반드시 있어야 하는 의존성이다. 디스크
    // 캐시 복원이 끝나는 순간 queryClient 안의 내용이 바뀌는데, 그 변화는
    // 참조 동일성으로 드러나지 않아 이 신호로만 다시 읽을 수 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestoring, queryClient]);
  const offlineCachedUnit =
    netInfo.isConnected === false || netInfo.isInternetReachable === false
      ? (cachedCalendar?.unit ?? null)
      : null;
  const unit = me.data?.unit ?? offlineCachedUnit;
  const isUnitAdmin =
    unit != null &&
    me.data?.user.id != null &&
    unit.adminId === me.data.user.id;
  const dischargeAt = me.data?.user.dischargeAt ?? null;
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();

  const myLeaveDays = useMemo(
    () => buildMyLeaveDayMap(myLeaves.data?.leaves),
    [myLeaves.data],
  );

  // 달력에서 휴가 칩을 길게 눌러 다른 날짜로 옮기는 조작. 미리보기와 저장을 맡는다.
  const leaveDrag = useLeaveDrag(myLeaves.data?.leaves, setEditingLeave);

  // 끄는 도중에는 시트가 닫히기를 기다리던 요청을 무효로 본다 — 그 사이에 폼이나
  // 상세 화면이 뜨면 드래그가 갈 곳을 잃는다.
  useEffect(() => {
    if (leaveDrag.isDragging) pendingAfterSheet.current = null;
  }, [leaveDrag.isDragging]);

  // 정기외박 주기는 프로필의 자동 적립 설정에서 파생한다(별도 API 없음).
  const regularOvernight = balances.data?.regularOvernight ?? null;
  // 갈래별 외출 설정 — 달력이 주기 시작일 마커를 그리는 데 쓴다.
  const outingConfigs = useMemo(() => {
    const map = new Map<OutingKind, OutingConfig>();
    for (const row of balances.data?.outing ?? []) map.set(row.kind, row);
    return map;
  }, [balances.data]);
  const currentCycle = useMemo(
    () => cycleForDisplay(regularOvernight, today, dischargeAt),
    [regularOvernight, today, dischargeAt],
  );
  // 잔여를 깎는 휴가만 센다. 예전에는 전체 구간을 그대로 넘겨서 취소·반려한 휴가가
  // 주기 몫을 계속 잡아먹은 것처럼 보였다(balance-segments.ts 주석 참고).
  const balanceSegments = useMemo(
    () => balanceCountedSegments(myLeaves.data?.leaves),
    [myLeaves.data],
  );
  const cycleUsage = useMemo(
    () => (currentCycle ? cycleUsedDays(currentCycle, balanceSegments) : 0),
    [currentCycle, balanceSegments],
  );
  // 이월 중에는 마감이라는 것이 없고, 쓸 수 있는 몫도 이번 주기가 아니라 누적이다.
  const pooledRemaining = useMemo(
    () =>
      regularOvernight?.carryOver
        ? regularOvernightPooledRemaining({
            config: regularOvernight,
            used: balanceSegments,
            dischargeAt,
            on: today,
          })
        : null,
    [regularOvernight, balanceSegments, dischargeAt, today],
  );
  // 첫 적립 전에는 주기가 없다. 대신 첫 적립일을 알려준다. 다만 그 적립일이 전역일보다
  // 뒤면 끝내 받지 못하므로 기다리라고 하지 않는다.
  const pendingFirstGrant = useMemo(() => {
    const first = firstGrantDate(regularOvernight);
    if (!first || today >= first) return null;
    return !dischargeAt || first <= dischargeAt ? first : null;
  }, [regularOvernight, today, dischargeAt]);
  const hasBanner = Boolean(currentCycle || pendingFirstGrant);
  // 넓은 창 요약 패널의 "남은 휴가". 내 휴가 화면과 같은 셈을 쓴다.
  const holdings = summarizeHoldings(balances.data?.balances);

  const glassStripHeight =
    STRIP_TOP_GAP +
    STATUS_ROW_HEIGHT +
    WEEK_ROW_HEIGHT +
    (hasBanner ? CYCLE_BANNER_HEIGHT : 0);
  // Android는 스택이 헤더 공간을 확보하므로 수동 여백을 중복 적용하지 않는다.
  const headerTopInset =
    process.env.EXPO_OS === "android" ? 0 : insets.top + NATIVE_HEADER_HEIGHT;
  const headerHeight = headerTopInset + glassStripHeight;

  // 선택 날짜가 속한 달의 달력(바텀시트 패널용). 스크롤 블록과 같은 캐시를 재사용.
  const panelMonth = selectedDate
    ? selectedDate.slice(0, 7)
    : today.slice(0, 7);
  const panelCalendar = useCalendar(unit?.id ?? null, panelMonth);
  // 그 달의 내 개인 일정. 달력 스크롤이 이미 채워 둔 캐시를 그대로 다시 쓴다.
  const panelPersonalEvents = usePersonalEvents(panelMonth);
  const isOffline =
    netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const lastUpdatedAt = Math.max(
    me.dataUpdatedAt,
    myLeaves.dataUpdatedAt,
    balances.dataUpdatedAt,
    panelCalendar.dataUpdatedAt,
  );
  const lastUpdatedLabel =
    lastUpdatedAt > 0
      ? LAST_UPDATED_FORMATTER.format(new Date(lastUpdatedAt))
      : "기록 없음";
  const syncStatusLabel = `${isOffline ? "오프라인 · " : ""}마지막 갱신 ${lastUpdatedLabel}`;

  // 재원 정보가 있어야 주기 표시선·배너를 처음부터 함께 그릴 수 있다. 함께 기다린다.
  if (isRestoring || (me.isPending && !unit) || balances.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  // 통신 실패를 "부대 없음"으로 보여주면 데이터가 사라진 것처럼 보인다. 따로 알린다.
  if (
    (me.isError && !me.data && !offlineCachedUnit) ||
    (balances.isError && !balances.data)
  ) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        {process.env.EXPO_OS === "web" && (
          <Text style={styles.webTitle}>휴가 계획 달력</Text>
        )}
        <ContentPanel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>불러오지 못했어요</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.syncStatus, isOffline && styles.syncStatusOffline]}
          >
            {syncStatusLabel}
          </Text>
          <Text style={styles.emptyBody}>
            서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.
          </Text>
          <Button
            title="다시 시도"
            onPress={() => {
              void me.refetch();
              void balances.refetch();
            }}
          />
        </ContentPanel>
      </View>
    );
  }

  // 부대가 없어도 달력은 그대로 연다. 부대가 필요한 것은 출타율·출타자·부대 일정뿐이고,
  // 내 휴가·개인 일정·전역일·주기 표시는 부대와 무관하다. 가입은 툴바에서 안내한다.

  /**
   * 휴가 등록 폼을 연다. 좁은 창에서 날짜 시트가 떠 있으면 먼저 닫고, 다 닫힌
   * 뒤에 연다.
   *
   * iOS는 한 화면에 모달을 하나만 띄울 수 있다. 시트가 떠 있는 채로 폼을 열면
   * UIKit이 표시를 거부하는데, RN은 거부되기 전에 이미 "표시됨"으로 표시해둬서
   * 그 상태가 그대로 굳는다. 그러면 폼은 영영 뜨지 않고, 굳은 모달이 화면을
   * 덮은 채 남아 달력의 스크롤·날짜 탭까지 먹통이 된다.
   *
   * 넓은 창에는 시트가 아예 없으므로 선택을 지우지 않고 바로 연다 — 폼을 닫으면
   * 인스펙터가 고르던 날짜를 그대로 들고 있다.
   */
  /** 의도를 실제로 수행한다. 시트가 닫힌 뒤에도 같은 함수가 다시 부른다. */
  const runIntent = (intent: CalendarIntent) => {
    switch (intent.kind) {
      case "form":
        setFormDate(intent.date);
        return;
      case "leave":
        router.push({
          pathname: "/leave/[leaveId]",
          params: { leaveId: intent.leaveId },
        });
        return;
      case "personalEvent":
        router.push({
          pathname: "/(tabs)/(calendar)/personal-event",
          params: { date: intent.date },
        });
        return;
      case "personalEvents":
        router.push("/(tabs)/(calendar)/personal-events");
        return;
      case "unitEvent":
        router.push({
          pathname: "/(tabs)/(calendar)/unit-event",
          params: { date: intent.date, month: intent.date.slice(0, 7) },
        });
        return;
    }
  };

  /**
   * 좁은 창에서 날짜 시트가 떠 있으면 먼저 닫고, 사라진 뒤에 수행한다.
   *
   * iOS는 모달을 하나만 띄운다 — 시트가 떠 있는 채로 다른 모달을 띄우거나 화면을
   * 밀면, 새 화면 위에 시트가 그대로 남거나 화면이 굳는다. 여기 오는 네 가지
   * 행동이 모두 같은 제약을 받으므로 한 문으로 모아 둔다.
   */
  const openAfterSheet = (intent: CalendarIntent) => {
    if (isCompact && selectedDate != null) {
      // 시트가 닫혔다고 알려오는 onClosed에서 이어서 수행한다.
      pendingAfterSheet.current = intent;
      setSelectedDate(null);
      return;
    }
    runIntent(intent);
  };

  const openForm = (date: ISODate) => openAfterSheet({ kind: "form", date });
  const openLeave = (leaveId: string) =>
    openAfterSheet({ kind: "leave", leaveId });

  const selectDate = (date: ISODate) => {
    // 새 날짜를 고르면 대기 중이던 요청은 무효로 본다.
    pendingAfterSheet.current = null;
    setSelectedDate((current) => (current === date ? null : date));
  };

  /**
   * 시트를 띄워도 되는 조건. 세 가지가 모두 맞아야 한다 —
   * 좁은 창이고, 고른 날짜가 있고, 등록 폼이 떠 있지 않을 것.
   */
  const daySheetPresented =
    isCompact && selectedDate != null && !formDate && !editingLeave;
  // 날짜 상세 시트 높이. 시트 디텐트와 시트 안 RN 콘텐츠가 같은 값을 써야
  // 안쪽 스크롤이 바닥까지 닿는다(sheet-snap-point.ts의 pinnedSheetHeight).
  const daySheetHeight = Math.round(windowHeight * 0.75);

  const calendarPane = (
    <View style={styles.calendarPane}>
      <CalendarScroll
        ref={scrollRef}
        unitId={unit?.id ?? null}
        selectedDate={selectedDate}
        contentTopInset={headerHeight}
        myLeaveDays={myLeaveDays}
        regularOvernight={regularOvernight}
        currentCycle={currentCycle}
        outing={outingConfigs}
        enlistedMonth={me.data?.user.enlistedAt.slice(0, 7) ?? null}
        dischargeAt={dischargeAt}
        onSelectDate={selectDate}
      />

      <LiquidGlassSurface
        style={[
          styles.glassStrip,
          {
            top: headerTopInset,
            height: glassStripHeight,
          },
        ]}
      >
        {/* 휴가를 끄는 동안에는 이 줄이 "어디로 놓이는지"를 알려준다. 손가락이
            달력을 가리므로, 새 기간을 읽을 자리가 화면 위쪽에 있어야 한다. */}
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.syncStatus,
            isOffline && !leaveDrag.statusLabel && styles.syncStatusOffline,
            leaveDrag.statusLabel != null && styles.dragStatus,
          ]}
        >
          {leaveDrag.statusLabel ?? syncStatusLabel}
        </Text>
        {currentCycle ? (
          <CycleBanner
            cycle={currentCycle}
            usedDays={cycleUsage}
            pooledRemaining={pooledRemaining}
          />
        ) : pendingFirstGrant ? (
          <FirstGrantBanner firstGrantDate={pendingFirstGrant} />
        ) : null}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((weekday, index) => (
            <Text
              key={weekday}
              style={[
                styles.weekday,
                (index === 0 || index === 6) && { color: colors.negative },
              ]}
            >
              {weekday}
            </Text>
          ))}
        </View>
      </LiquidGlassSurface>
    </View>
  );

  const inspectorPane = (
    <View style={styles.inspectorPane} testID="calendar-day-inspector">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.inspectorContent,
          {
            // 투명한 네이티브 헤더 아래에서 시작하고, 탭바에 가리지 않게 끝난다.
            paddingTop: headerTopInset + spacing.sm,
            paddingBottom: insets.bottom + spacing.xxxl * 2,
          },
        ]}
      >
        {selectedDate ? (
          <>
            <View style={styles.inspectorHeader}>
              <Text style={styles.inspectorTitle}>날짜 상세</Text>
              <Button
                title="선택 해제"
                variant="ghost"
                size="sm"
                onPress={() => setSelectedDate(null)}
                testID="calendar-clear-selection"
              />
            </View>
            {panelCalendar.data ? (
              <DayPanel
                calendar={panelCalendar.data}
                date={selectedDate}
                myUserId={me.data?.user.id}
                cycle={cycleForDisplay(
                  regularOvernight,
                  selectedDate,
                  dischargeAt,
                )}
                dischargeAt={dischargeAt}
                onOpenLeave={openLeave}
                onAddLeave={() => openForm(selectedDate)}
                onAddPersonalEvent={() =>
                  router.push({
                    pathname: "/(tabs)/(calendar)/personal-event",
                    params: {
                      date: selectedDate,
                      month: selectedDate.slice(0, 7),
                    },
                  })
                }
                onAddUnitEvent={
                  isUnitAdmin
                    ? () =>
                        router.push({
                          pathname: "/(tabs)/(calendar)/unit-event",
                          params: {
                            date: selectedDate,
                            month: selectedDate.slice(0, 7),
                          },
                        })
                    : undefined
                }
                personalEvents={panelPersonalEvents.data?.events}
                onOpenPersonalEvents={() =>
                  openAfterSheet({ kind: "personalEvents" })
                }
                onOpenPersonalEvent={(eventId) =>
                  router.push({
                    pathname: "/(tabs)/(calendar)/personal-event",
                    params: { eventId, month: selectedDate.slice(0, 7) },
                  })
                }
                onOpenUnitEvent={
                  isUnitAdmin
                    ? (eventId) =>
                        router.push({
                          pathname: "/(tabs)/(calendar)/unit-event",
                          params: {
                            eventId,
                            month: selectedDate.slice(0, 7),
                          },
                        })
                    : undefined
                }
                style={styles.inspectorDayPanel}
              />
            ) : (
              <View style={styles.inspectorLoading}>
                <ActivityIndicator color={colors.ink} />
              </View>
            )}
          </>
        ) : (
          <CalendarOverviewPanel
            calendar={panelCalendar.data ?? null}
            today={today}
            holdings={holdings}
            leaves={myLeaves.data?.leaves ?? []}
            cycle={currentCycle}
            cycleUsedDays={cycleUsage}
            onSelectDate={selectDate}
            onOpenLeave={(leaveId) =>
              router.push({ pathname: "/leave/[leaveId]", params: { leaveId } })
            }
            onAddLeave={() => openForm(today)}
          />
        )}
      </ScrollView>
    </View>
  );

  return (
    <>
      <SplitPane
        sizeClass={sizeClass}
        primary={calendarPane}
        inspector={inspectorPane}
        gap={0}
        style={styles.root}
      />

      {/*
        툴바에는 두 개만 둔다 — "오늘"과 "일정 추가".
        예전에는 개인 일정·부대 일정·오늘·＋가 나란히 있었는데, 네 개가 되면
        어느 것이 주 행동인지 사라지고 좁은 화면에서는 글자가 잘렸다.
        추가할 수 있는 세 가지는 서로 배타적인 선택이므로 메뉴가 맞는 자리다.

        `Stack.Toolbar.Menu`의 루트 아이콘은 안드로이드에서 SF Symbol이 조용히
        버려진다. 그래서 아이콘 대신 라벨로 둔다 — 두 플랫폼에서 같은 것이 보인다.
      */}
      <Stack.Toolbar placement="right">
        {/* 부대가 없으면 가입이 이 화면의 주 행동이다. 달력 자체는 그대로 쓰이므로
            막지 않고, 부대가 있어야 열리는 것(출타율·명단)만 여기서 안내한다. */}
        {!unit ? (
          <Stack.Toolbar.Button onPress={() => router.push("/units")}>
            부대 가입
          </Stack.Toolbar.Button>
        ) : null}
        <Stack.Toolbar.Button
          onPress={() => scrollRef.current?.scrollToToday()}
        >
          오늘
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Menu
          variant="prominent"
          tintColor={colors.brand}
          accessibilityLabel="일정 추가"
          title="무엇을 추가할까요"
        >
          <Stack.Toolbar.Label>일정 추가</Stack.Toolbar.Label>
          <Stack.Toolbar.MenuAction
            icon="calendar.badge.plus"
            onPress={() =>
              openAfterSheet({ kind: "form", date: selectedDate ?? today })
            }
          >
            휴가
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="person.crop.circle.badge.plus"
            onPress={() =>
              openAfterSheet({
                kind: "personalEvent",
                date: selectedDate ?? today,
              })
            }
          >
            개인 일정
          </Stack.Toolbar.MenuAction>
          {/* 부대 일정은 예전과 같이 그룹 관리자에게만 보인다. */}
          {isUnitAdmin ? (
            <Stack.Toolbar.MenuAction
              icon="building.2"
              onPress={() =>
                openAfterSheet({
                  kind: "unitEvent",
                  date: selectedDate ?? today,
                })
              }
            >
              부대 일정
            </Stack.Toolbar.MenuAction>
          ) : null}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>

      {/* 좁은 창의 선택 날짜 상세: SwiftUI / Material 네이티브 바텀시트 */}
      <NativeBottomSheet
        isPresented={daySheetPresented}
        // 디텐트는 절대 높이 하나로 준다. 여러 개면 SwiftUI가 콘텐츠를 최대 디텐트
        // 기준으로 배치해 RN 루트가 보이는 시트보다 커지고, 비율(fraction)로 주면
        // 그 비율의 기준 높이를 RN이 알 수 없어 시트와 RN 콘텐츠의 높이가 어긋난다.
        // 둘 중 어느 쪽이든 안쪽 스크롤이 바닥에 닿지 못한다(sheet-snap-point.ts).
        snapPoints={[{ height: daySheetHeight }]}
        testID="calendar-day-sheet"
        // 사용자가 시트를 직접 내렸다. 대기 중이던 폼 요청은 무효로 본다.
        // 창이 넓어져서 내려간 경우에는 선택을 지우지 않는다 — 같은 선택이
        // 인스펙터로 자리를 옮겼을 뿐이고, 지우면 보던 날짜를 잃는다.
        onDismiss={() => {
          pendingAfterSheet.current = null;
          if (isCompact && !formDate && !editingLeave) setSelectedDate(null);
        }}
        // 시트가 화면에서 사라진 뒤. 이제 모달을 띄우거나 화면을 밀어도 된다.
        onClosed={() => {
          const pending = pendingAfterSheet.current;
          if (!pending) return;
          pendingAfterSheet.current = null;
          runIntent(pending);
        }}
      >
        <SheetScaffold
          title="날짜 상세"
          onClose={() => setSelectedDate(null)}
          contentContainerStyle={styles.daySheetContent}
          // 드래그 인디케이터 자리를 헤더 안쪽에 둔다. 헤더 배경이 시트 맨 위까지
          // 이어져야 콘텐츠가 시트에 얹힌 카드로 보이지 않는다.
          headerTopInset={SHEET_GRABBER_INSET}
          // 표면이 시트 바닥까지 내려앉는 플랫폼에서는 홈 인디케이터를 피하는
          // 여백을 본문 아래쪽에서 잡는다.
          extendsUnderBottomInset={SHEET_EXTENDS_UNDER_BOTTOM_INSET}
        >
          {selectedDate &&
            (panelCalendar.data ? (
              <DayPanel
                calendar={panelCalendar.data}
                date={selectedDate}
                myUserId={me.data?.user.id}
                cycle={cycleForDisplay(
                  regularOvernight,
                  selectedDate,
                  dischargeAt,
                )}
                dischargeAt={dischargeAt}
                onOpenLeave={openLeave}
                onAddLeave={() => openForm(selectedDate)}
                onAddPersonalEvent={() =>
                  router.push({
                    pathname: "/(tabs)/(calendar)/personal-event",
                    params: {
                      date: selectedDate,
                      month: selectedDate.slice(0, 7),
                    },
                  })
                }
                onAddUnitEvent={
                  isUnitAdmin
                    ? () =>
                        router.push({
                          pathname: "/(tabs)/(calendar)/unit-event",
                          params: {
                            date: selectedDate,
                            month: selectedDate.slice(0, 7),
                          },
                        })
                    : undefined
                }
                personalEvents={panelPersonalEvents.data?.events}
                onOpenPersonalEvents={() =>
                  openAfterSheet({ kind: "personalEvents" })
                }
                onOpenPersonalEvent={(eventId) =>
                  router.push({
                    pathname: "/(tabs)/(calendar)/personal-event",
                    params: { eventId, month: selectedDate.slice(0, 7) },
                  })
                }
                onOpenUnitEvent={
                  isUnitAdmin
                    ? (eventId) =>
                        router.push({
                          pathname: "/(tabs)/(calendar)/unit-event",
                          params: {
                            eventId,
                            month: selectedDate.slice(0, 7),
                          },
                        })
                    : undefined
                }
              />
            ) : (
              <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
                <ActivityIndicator color={colors.ink} />
              </View>
            ))}
        </SheetScaffold>
      </NativeBottomSheet>

      {formDate && (
        <LazyLeaveFormModal
          visible
          initialDate={formDate}
          onClose={() => setFormDate(null)}
        />
      )}
      {editingLeave && (
        <LazyLeaveFormModal
          visible
          editing={editingLeave}
          onSaved={(result) => {
            scrollRef.current?.scrollToMonth(
              result.leave.startDate.slice(0, 7),
            );
          }}
          onClose={() => setEditingLeave(null)}
        />
      )}
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvas },
  /** 달력 열. 글래스 스트립이 이 열 안에서만 절대 배치되도록 기준을 잡는다. */
  calendarPane: { flex: 1, backgroundColor: colors.canvas },
  /**
   * 오른쪽 붙박이 패널. 달력과 다른 표면색 + 머리카락 선으로 두 열을 가른다.
   * 두 스킴 모두에서 canvas와 canvasSoft는 서로 다른 명도라 경계가 남는다.
   */
  inspectorPane: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairline,
  },
  inspectorContent: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  inspectorHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inspectorTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
  // 시트에서는 넉넉한 여백이 맞지만, 인스펙터는 이미 열 자체에 여백이 있다.
  inspectorDayPanel: { padding: 0 },
  inspectorLoading: { paddingVertical: spacing.xxxl, alignItems: "center" },
  glassStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingTop: STRIP_TOP_GAP,
    zIndex: 10,
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  syncStatus: {
    height: 20,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
    textAlign: "center",
    fontSize: 11,
    color: colors.mute,
  },
  syncStatusOffline: {
    color: colors.negativeDeep,
    fontWeight: "700",
  },
  /** 드래그 안내. 같은 자리를 쓰지만 지금 조작 중인 값이라 또렷하게 읽혀야 한다. */
  dragStatus: {
    color: colors.ink,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    padding: spacing.xxl,
    gap: spacing.lg,
    maxWidth: 420,
    width: "100%",
  },
  emptyTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.body },
  webTitle: {
    position: "absolute",
    top: 80,
    left: spacing.lg,
    fontSize: 28,
    fontWeight: "800",
    color: colors.ink,
  },
  weekRow: {
    height: WEEK_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.mute,
  },
  daySheetContent: { padding: 0, gap: 0 },
}));
