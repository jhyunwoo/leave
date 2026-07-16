import {
  maxAllowedOut,
  shiftMonth,
  splitMonth,
  todayInSeoul,
  type ISODate,
} from "@leave/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendar, useMe, useRegisterPushToken } from "@/api/queries";
import { Button } from "@/components/button";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { MonthCalendar } from "@/components/month-calendar";
import { getPushToken } from "@/lib/notifications";
import { colors, radius, spacing, WIDE_BREAKPOINT } from "@/theme";
import { DayPanel } from "./day-panel";

export function CalendarScreen() {
  const me = useMe();
  const today = todayInSeoul();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const unit = me.data?.unit ?? null;
  const calendar = useCalendar(unit?.id ?? null, month);
  const registerPush = useRegisterPushToken();

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

  if (me.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  if (!unit) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>아직 소속 부대가 없어요</Text>
          <Text style={styles.emptyBody}>
            부대에 들어가면 부대원들의 휴가 달력이 열려요. 부대를 검색하거나 새로
            만들 수 있어요.
          </Text>
          <Button title="부대 찾기" onPress={() => router.push("/units")} />
        </View>
      </View>
    );
  }

  const { year, monthNum } = splitMonth(month);
  const allowed = maxAllowedOut(unit.memberCount, {
    numerator: unit.maxLeaveNumerator,
    denominator: unit.maxLeaveDenominator,
  });

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          padding: spacing.lg,
          paddingBottom: 120,
        }}
        refreshControl={
          <RefreshControl
            refreshing={calendar.isRefetching}
            onRefresh={() => void calendar.refetch()}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              {unit.name} · {year}
            </Text>
            <Text style={styles.monthTitle}>{monthNum}월</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMonth(today.slice(0, 7));
                setSelectedDate(today);
              }}
              style={styles.todayBtn}
            >
              <Text style={styles.todayBtnText}>오늘</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              onPress={() => setMonth((m) => shiftMonth(m, -1))}
              style={styles.navBtn}
            >
              <Text style={styles.navBtnText}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              onPress={() => setMonth((m) => shiftMonth(m, 1))}
              style={styles.navBtn}
            >
              <Text style={styles.navBtnText}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.body, isWide && { flexDirection: "row" }]}>
          <View style={[styles.calCard, isWide && { flex: 3 }]}>
            {calendar.isPending ? (
              <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
                <ActivityIndicator color={colors.ink} />
              </View>
            ) : calendar.isError ? (
              <Text style={styles.errorText}>
                달력을 불러오지 못했습니다. 아래로 당겨 새로고침해보세요.
              </Text>
            ) : (
              <>
                <MonthCalendar
                  calendar={calendar.data}
                  selectedDate={selectedDate}
                  onSelectDate={(d) =>
                    setSelectedDate((cur) => (cur === d ? null : d))
                  }
                />
                <View style={styles.legend}>
                  <Text style={styles.legendText}>
                    하루 최대 출타 {unit.maxLeaveNumerator}/
                    {unit.maxLeaveDenominator} (부대원 {unit.memberCount}명 기준{" "}
                    {allowed}명)
                  </Text>
                  <Text style={[styles.legendText, { color: colors.negativeDeep }]}>
                    ● 빨간 날 = 출타율 초과
                  </Text>
                </View>
              </>
            )}
          </View>

          {selectedDate && calendar.data && (
            <View style={isWide ? { flex: 2 } : undefined}>
              <DayPanel
                calendar={calendar.data}
                date={selectedDate}
                onAddLeave={() => setFormOpen(true)}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* 휴가 등록 FAB */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="휴가 등록"
        onPress={() => setFormOpen(true)}
        style={[styles.fab, { bottom: insets.bottom + 96 }]}
      >
        <Text style={styles.fabText}>＋ 휴가 등록</Text>
      </Pressable>

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
  root: { flex: 1, backgroundColor: colors.canvasSoft },
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
  },
  emptyTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.body },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.lg,
    flexWrap: "wrap",
    gap: spacing.md,
  },
  eyebrow: { fontSize: 12, fontWeight: "600", color: colors.mute },
  monthTitle: {
    fontSize: 56,
    fontWeight: "900",
    color: colors.ink,
    lineHeight: 60,
    letterSpacing: -1,
  },
  headerActions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  todayBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.canvas,
  },
  todayBtnText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnText: { fontSize: 22, color: colors.ink, lineHeight: 26 },
  body: { gap: spacing.lg, alignItems: "flex-start" },
  calCard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignSelf: "stretch",
  },
  legend: { marginTop: spacing.md, gap: 4 },
  legendText: { fontSize: 12, color: colors.mute },
  errorText: { fontSize: 14, color: colors.body, padding: spacing.lg },
  fab: {
    position: "absolute",
    right: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { fontSize: 16, fontWeight: "600", color: colors.onPrimary },
});
