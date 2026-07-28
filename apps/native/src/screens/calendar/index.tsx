import {
  effectiveMemberCount,
  maxAllowedOut,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { BlurTargetView, BlurView } from "expo-blur";
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
  const topInset = process.env.EXPO_OS === "web" ? spacing.lg : insets.top;
  const headerHeight = topInset + 92;
  const scrollRef = useRef<CalendarScrollHandle>(null);
  const blurTargetRef = useRef<View>(null);

  const unit = me.data?.unit ?? null;
  const registerPush = useRegisterPushToken();

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
            onSelectDate={(d) =>
              setSelectedDate((cur) => (cur === d ? null : d))
            }
          />
        </BlurTargetView>

        <BlurView
          blurTarget={blurTargetRef}
          blurMethod={
            process.env.EXPO_OS === "android"
              ? "dimezisBlurViewSdk31Plus"
              : undefined
          }
          tint="systemChromeMaterialLight"
          intensity={82}
          style={[
            styles.header,
            { height: headerHeight, paddingTop: topInset },
          ]}
        >
          <View style={styles.headerMain}>
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
                style={({ pressed }) => [
                  styles.todayBtn,
                  pressed && { transform: [{ scale: 0.96 }] },
                ]}
              >
                <Text style={styles.todayBtnText}>오늘</Text>
              </Pressable>
              <Button
                title="휴가 등록"
                size="sm"
                onPress={() => setFormOpen(true)}
              />
            </View>
          </View>
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
        </BlurView>
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
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(14, 15, 12, 0.14)",
    overflow: "hidden",
  },
  headerMain: {
    height: 60,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  eyebrow: { fontSize: 12, fontWeight: "600", color: colors.mute },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  todayBtn: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  todayBtnText: { fontSize: 14, fontWeight: "700", color: colors.brand },
  weekRow: {
    height: 32,
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
