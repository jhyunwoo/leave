import {
  effectiveMemberCount,
  maxAllowedOut,
  todayInSeoul,
  type ISODate,
} from "@leave/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { useCalendar, useMe, useRegisterPushToken } from "@/api/queries";
import { Button } from "@/components/button";
import {
  CalendarScroll,
  type CalendarScrollHandle,
} from "@/components/calendar-scroll";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { getPushToken } from "@/lib/notifications";
import { colors, radius, spacing } from "@/theme";
import { DayPanel } from "./day-panel";

export function CalendarScreen() {
  const me = useMe();
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<CalendarScrollHandle>(null);

  const unit = me.data?.unit ?? null;
  const registerPush = useRegisterPushToken();

  // 선택 날짜가 속한 달의 달력(바텀시트 패널용). 스크롤 블록과 같은 캐시를 재사용.
  const panelMonth = selectedDate ? selectedDate.slice(0, 7) : today.slice(0, 7);
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

  const basis = effectiveMemberCount(unit.headcount, unit.memberCount);
  const allowed = maxAllowedOut(basis, {
    numerator: unit.maxLeaveNumerator,
    denominator: unit.maxLeaveDenominator,
  });

  return (
    <>
      <View
        style={[styles.root, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {unit.name}
            </Text>
            <Text style={styles.title}>부대 달력</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedDate(today);
                scrollRef.current?.scrollToToday();
              }}
              style={styles.todayBtn}
            >
              <Text style={styles.todayBtnText}>오늘</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.calCard}>
          <CalendarScroll
            ref={scrollRef}
            unitId={unit.id}
            selectedDate={selectedDate}
            onSelectDate={(d) =>
              setSelectedDate((cur) => (cur === d ? null : d))
            }
          />
          <View style={styles.legend}>
            <Text style={styles.legendText}>
              하루 최대 출타 {unit.maxLeaveNumerator}/{unit.maxLeaveDenominator} (
              {unit.headcount != null ? "부대 인원" : "가입자"} {basis}명 기준{" "}
              {allowed}명)
            </Text>
            <Text style={[styles.legendText, { color: colors.negativeDeep }]}>
              ● 빨간 날 = 출타율 초과 · 공휴일은 빨간 날짜
            </Text>
          </View>
        </View>

        {/* 휴가 등록 FAB */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="휴가 등록"
          onPress={() => setFormOpen(true)}
          style={[styles.fab, { bottom: insets.bottom + 96 }]}
        >
          <Text style={styles.fabText}>＋ 휴가 등록</Text>
        </Pressable>
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
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
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
  root: { flex: 1, backgroundColor: colors.canvasSoft, padding: spacing.lg },
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
    gap: spacing.md,
  },
  eyebrow: { fontSize: 12, fontWeight: "600", color: colors.mute },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  headerActions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  todayBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.canvas,
  },
  todayBtnText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  calCard: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  legend: { marginTop: spacing.md, gap: 4 },
  legendText: { fontSize: 12, color: colors.mute },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 15, 12, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: "82%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.canvasSoft,
    marginBottom: spacing.md,
  },
});
