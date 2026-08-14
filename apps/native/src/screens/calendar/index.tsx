/**
 * 달력 화면 — 앱의 첫 화면.
 *
 * 사용처: 달력 탭(app/(tabs)/(calendar)/index.tsx).
 *
 * 그룹에 속해 있으면 스크롤 달력과 하루 패널을, 아직 그룹이 없으면 참여 안내를
 * 보여준다. 날짜를 고르면 그날 기준으로 휴가 등록 시트가 열린다.
 * 웹의 CalendarPage와 같은 정보를 같은 규칙으로 보여준다.
 */

import {
  cycleFor,
  cycleUsedDays,
  firstGrantDate,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { useNetInfo } from "@react-native-community/netinfo";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useCalendar,
  useLeaveBalances,
  useMe,
  useMyLeaves,
  type Calendar,
} from "@leave/client";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { LiquidGlassSurface } from "@/components/liquid-glass-surface";
import {
  CalendarScroll,
  type CalendarScrollHandle,
} from "@/components/calendar-scroll";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { NativeBottomSheet } from "@/components/native-bottom-sheet";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { buildMyLeaveDayMap } from "@leave/client";
import { makeStyles, spacing, useColors } from "@/theme";
import {
  CYCLE_BANNER_HEIGHT,
  CycleBanner,
  FirstGrantBanner,
} from "./cycle-banner";
import { DayPanel } from "./day-panel";

/** 헤더 아래 요일 행 높이. */
const WEEK_ROW_HEIGHT = 32;
/** 동기화 시각 한 줄. 아래 styles.syncStatus의 height와 같아야 한다. */
const STATUS_ROW_HEIGHT = 20;
const NATIVE_HEADER_HEIGHT = process.env.EXPO_OS === "android" ? 56 : 44;

const LAST_UPDATED_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function CalendarScreen() {
  const styles = useStyles();
  const colors = useColors();
  const me = useMe();
  const netInfo = useNetInfo();
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  // 폼을 열었는지와 폼의 시작일을 한 값으로 둔다. 날짜 시트를 닫으면서 열어야
  // 하기 때문에 시작일을 selectedDate와 따로 기억해야 한다.
  const [formDate, setFormDate] = useState<ISODate | null>(null);
  // 시트가 닫히기를 기다리는 폼 시작일. 아래 openForm 주석 참고.
  const pendingFormDate = useRef<ISODate | null>(null);
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
  }, [isRestoring, queryClient]);
  const offlineCachedUnit =
    netInfo.isConnected === false || netInfo.isInternetReachable === false
      ? (cachedCalendar?.unit ?? null)
      : null;
  const unit = me.data?.unit ?? offlineCachedUnit;
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();

  const myLeaveDays = useMemo(
    () => buildMyLeaveDayMap(myLeaves.data?.leaves),
    [myLeaves.data],
  );

  // 정기외박 주기는 프로필의 자동 적립 설정에서 파생한다(별도 API 없음).
  const regularOvernight = balances.data?.regularOvernight ?? null;
  const currentCycle = useMemo(
    () => cycleFor(regularOvernight, today),
    [regularOvernight, today],
  );
  const cycleUsage = useMemo(
    () =>
      currentCycle
        ? cycleUsedDays(
            currentCycle,
            (myLeaves.data?.leaves ?? []).flatMap((leave) => leave.segments),
          )
        : 0,
    [currentCycle, myLeaves.data],
  );
  // 첫 적립 전에는 주기가 없다. 대신 첫 적립일을 알려준다.
  const pendingFirstGrant = useMemo(() => {
    const first = firstGrantDate(regularOvernight);
    return first && today < first ? first : null;
  }, [regularOvernight, today]);
  const hasBanner = Boolean(currentCycle || pendingFirstGrant);

  const glassStripHeight =
    STATUS_ROW_HEIGHT + WEEK_ROW_HEIGHT + (hasBanner ? CYCLE_BANNER_HEIGHT : 0);
  const headerHeight = insets.top + NATIVE_HEADER_HEIGHT + glassStripHeight;

  // 선택 날짜가 속한 달의 달력(바텀시트 패널용). 스크롤 블록과 같은 캐시를 재사용.
  const panelMonth = selectedDate
    ? selectedDate.slice(0, 7)
    : today.slice(0, 7);
  const panelCalendar = useCalendar(unit?.id ?? null, panelMonth);
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

  if (!unit) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        {process.env.EXPO_OS === "web" && (
          <Text style={styles.webTitle}>휴가 계획 달력</Text>
        )}
        <ContentPanel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>아직 공유 그룹이 없어요</Text>
          <Text style={styles.emptyBody}>
            초대코드로 그룹에 참여하거나 새 그룹을 만들면 누가 언제 나가는지
            보이는 달력이 열려요. 그룹 이름에는 실제 부대명을 입력하지 마세요.
          </Text>
          <Button
            title="그룹 참여·만들기"
            onPress={() => router.push("/units")}
          />
        </ContentPanel>
      </View>
    );
  }

  /**
   * 휴가 등록 폼을 연다. 날짜 시트가 떠 있으면 먼저 닫고, 다 닫힌 뒤에 연다.
   *
   * iOS는 한 화면에 모달을 하나만 띄울 수 있다. 시트가 떠 있는 채로 폼을 열면
   * UIKit이 표시를 거부하는데, RN은 거부되기 전에 이미 "표시됨"으로 표시해둬서
   * 그 상태가 그대로 굳는다. 그러면 폼은 영영 뜨지 않고, 굳은 모달이 화면을
   * 덮은 채 남아 달력의 스크롤·날짜 탭까지 먹통이 된다.
   */
  const openForm = (date: ISODate) => {
    if (selectedDate == null) {
      setFormDate(date);
      return;
    }
    setSelectedDate(null);
    if (process.env.EXPO_OS === "ios") {
      // 시트의 onDismiss(닫힘 애니메이션까지 끝난 시점)에서 이어서 연다.
      pendingFormDate.current = date;
    } else {
      // 안드로이드 모달은 Dialog라 겹쳐도 되고, onDismiss도 오지 않는다.
      setFormDate(date);
    }
  };

  return (
    <>
      <View style={styles.root}>
        <View style={styles.calendarLayer}>
          <CalendarScroll
            ref={scrollRef}
            unitId={unit.id}
            selectedDate={selectedDate}
            contentTopInset={headerHeight}
            myLeaveDays={myLeaveDays}
            regularOvernight={regularOvernight}
            currentCycle={currentCycle}
            enlistedMonth={me.data?.user.enlistedAt.slice(0, 7) ?? null}
            onSelectDate={(d) => {
              // 새 날짜를 고르면 대기 중이던 폼 요청은 무효로 본다.
              pendingFormDate.current = null;
              setSelectedDate((cur) => (cur === d ? null : d));
            }}
          />
        </View>

        <LiquidGlassSurface
          style={[
            styles.glassStrip,
            {
              top: insets.top + NATIVE_HEADER_HEIGHT,
              height: glassStripHeight,
            },
          ]}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.syncStatus, isOffline && styles.syncStatusOffline]}
          >
            {syncStatusLabel}
          </Text>
          {currentCycle ? (
            <CycleBanner cycle={currentCycle} usedDays={cycleUsage} />
          ) : pendingFirstGrant ? (
            <FirstGrantBanner firstGrantDate={pendingFirstGrant} />
          ) : null}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((weekday, index) => (
              <Text
                key={weekday}
                style={[
                  styles.weekday,
                  index === 0 && { color: colors.negative },
                ]}
              >
                {weekday}
              </Text>
            ))}
          </View>
        </LiquidGlassSurface>
      </View>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => scrollRef.current?.scrollToToday()}
        >
          오늘
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="plus"
          variant="prominent"
          tintColor={colors.brand}
          onPress={() => openForm(selectedDate ?? today)}
        >
          휴가 등록
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {/* 선택 날짜 상세: SwiftUI / Material 네이티브 바텀시트 */}
      <NativeBottomSheet
        isPresented={selectedDate != null}
        // 디텐트는 하나만 준다. 여러 개면 SwiftUI가 콘텐츠를 최대 디텐트 기준으로
        // 배치해 RN 루트가 보이는 시트보다 커지고, 안쪽 스크롤이 바닥에 닿지 못한다.
        snapPoints={[{ fraction: 0.75 }]}
        testID="calendar-day-sheet"
        onDismiss={() => {
          setSelectedDate(null);
          const pending = pendingFormDate.current;
          if (!pending) return;
          pendingFormDate.current = null;
          setFormDate(pending);
        }}
      >
        <SheetScaffold
          title="날짜 상세"
          onClose={() => setSelectedDate(null)}
          contentContainerStyle={styles.daySheetContent}
        >
          {selectedDate &&
            (panelCalendar.data ? (
              <DayPanel
                calendar={panelCalendar.data}
                date={selectedDate}
                myUserId={me.data?.user.id}
                cycle={cycleFor(regularOvernight, selectedDate)}
                onAddLeave={() => openForm(selectedDate)}
              />
            ) : (
              <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
                <ActivityIndicator color={colors.ink} />
              </View>
            ))}
        </SheetScaffold>
      </NativeBottomSheet>

      {formDate && (
        <LeaveFormModal
          visible
          initialDate={formDate}
          onClose={() => setFormDate(null)}
        />
      )}
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvas },
  calendarLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.canvas,
  },
  glassStrip: {
    position: "absolute",
    left: 0,
    right: 0,
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
