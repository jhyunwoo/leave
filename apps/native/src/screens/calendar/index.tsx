import {
  cycleFor,
  cycleUsedDays,
  effectiveMemberCount,
  maxAllowedOut,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { BlurTargetView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useCalendar,
  useLeaveBalances,
  useMe,
  useMyLeaves,
  useRegisterPushToken,
} from "@/api/queries";
import { Button } from "@/components/button";
import {
  CalendarScroll,
  type CalendarScrollHandle,
} from "@/components/calendar-scroll";
import { LeaveFormModal } from "@/components/leave-form-modal";
import {
  ScreenHeader,
  useScreenHeaderHeight,
} from "@/components/screen-header";
import { buildMyLeaveDayMap } from "@/lib/my-leave-days";
import { getPushToken } from "@/lib/notifications";
import { colors, radius, spacing } from "@/theme";
import { CYCLE_BANNER_HEIGHT, CycleBanner } from "./cycle-banner";
import { DayPanel } from "./day-panel";

/** 헤더 아래 요일 행 높이. */
const WEEK_ROW_HEIGHT = 32;

export function CalendarScreen() {
  const me = useMe();
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<CalendarScrollHandle>(null);
  const blurTargetRef = useRef<View>(null);

  const unit = me.data?.unit ?? null;
  const registerPush = useRegisterPushToken();
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();

  const myLeaveDays = useMemo(
    () => buildMyLeaveDayMap(myLeaves.data?.leaves),
    [myLeaves.data],
  );

  // 정기외박 주기는 프로필의 자동 적립 설정에서 파생한다(별도 API 없음).
  const regularOvernight = balances.data?.regularOvernight ?? null;
  const enlistedAt = me.data?.user.enlistedAt ?? today;
  const currentCycle = useMemo(
    () => cycleFor(regularOvernight, today, enlistedAt),
    [regularOvernight, today, enlistedAt],
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

  const headerHeight = useScreenHeaderHeight({
    subtitle: true,
    belowHeight: WEEK_ROW_HEIGHT + (currentCycle ? CYCLE_BANNER_HEIGHT : 0),
  });

  // 선택 날짜가 속한 달의 달력(바텀시트 패널용). 스크롤 블록과 같은 캐시를 재사용.
  const panelMonth = selectedDate
    ? selectedDate.slice(0, 7)
    : today.slice(0, 7);
  const panelCalendar = useCalendar(unit?.id ?? null, panelMonth);

  // 로그인 후 한 번 푸시 토큰 등록 (권한 거부/시뮬레이터면 조용히 건너뜀)
  useEffect(() => {
    if (!me.data) return;
    let cancelled = false;
    void getPushToken().then((token) => {
      if (token && !cancelled) registerPush.mutate(token);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.user.id]);

  // 정기외박 주기 유무에 따라 달력 한 달의 고정 높이가 달라지므로,
  // 재원 정보가 도착하기 전에 그리면 나중에 레이아웃이 튄다. 함께 기다린다.
  if (me.isPending || balances.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  // 통신 실패를 "부대 없음"으로 보여주면 데이터가 사라진 것처럼 보인다. 따로 알린다.
  if (me.isError || balances.isError) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>불러오지 못했어요</Text>
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
        </View>
      </View>
    );
  }

  if (!unit) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>아직 소속 부대가 없어요</Text>
          <Text style={styles.emptyBody}>
            부대에 들어가면 부대원들의 휴가 달력이 열려요. 부대를 검색하거나
            새로 만들 수 있어요.
          </Text>
          <Button title="부대 찾기" onPress={() => router.push("/units")} />
        </View>
      </View>
    );
  }

  const basis = effectiveMemberCount(unit.headcount, unit.memberCount);
  const allowed = maxAllowedOut(
    basis,
    {
      numerator: unit.maxLeaveNumerator,
      denominator: unit.maxLeaveDenominator,
    },
    unit.maxLeaveCount,
  );
  const limitSummary =
    unit.maxLeaveCount != null
      ? `하루 최대 ${unit.maxLeaveCount}명 직접 지정 · 빨간 배경은 초과`
      : `하루 최대 ${allowed}명 (${unit.maxLeaveNumerator}/${unit.maxLeaveDenominator}) · 빨간 배경은 초과`;

  return (
    <>
      <View style={styles.root}>
        <BlurTargetView ref={blurTargetRef} style={styles.calendarLayer}>
          <CalendarScroll
            ref={scrollRef}
            unitId={unit.id}
            selectedDate={selectedDate}
            contentTopInset={headerHeight}
            limitSummary={limitSummary}
            myLeaveDays={myLeaveDays}
            regularOvernight={regularOvernight}
            enlistedAt={enlistedAt}
            currentCycle={currentCycle}
            onSelectDate={(d) =>
              setSelectedDate((cur) => (cur === d ? null : d))
            }
          />
        </BlurTargetView>

        <ScreenHeader
          title="부대 달력"
          subtitle={unit.name}
          blurTarget={blurTargetRef}
          belowHeight={
            WEEK_ROW_HEIGHT + (currentCycle ? CYCLE_BANNER_HEIGHT : 0)
          }
          actions={
            <>
              <Button
                title="오늘"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setSelectedDate(today);
                  scrollRef.current?.scrollToToday();
                }}
              />
              <Button
                title="휴가 등록"
                size="sm"
                onPress={() => setFormOpen(true)}
              />
            </>
          }
          below={
            <>
              {currentCycle && (
                <CycleBanner cycle={currentCycle} usedDays={cycleUsage} />
              )}
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
            </>
          }
        />
      </View>

      {/* 선택 날짜 상세: 바텀시트 */}
      <Modal
        visible={selectedDate != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDate(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSelectedDate(null)}
        >
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {selectedDate &&
              (panelCalendar.data ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <DayPanel
                    calendar={panelCalendar.data}
                    date={selectedDate}
                    myUserId={me.data?.user.id}
                    cycle={cycleFor(regularOvernight, selectedDate, enlistedAt)}
                    onAddLeave={() => setFormOpen(true)}
                  />
                </ScrollView>
              ) : (
                <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
                  <ActivityIndicator color={colors.ink} />
                </View>
              ))}
          </Pressable>
        </Pressable>
      </Modal>

      {formOpen && (
        <LeaveFormModal
          visible={formOpen}
          initialDate={selectedDate ?? today}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  calendarLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.canvas,
  },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.lg,
    maxWidth: 420,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.hairline,
    borderCurve: "continuous",
  },
  emptyTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.body },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 17, 17, 0.32)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: "82%",
    borderCurve: "continuous",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    marginBottom: spacing.md,
  },
});
