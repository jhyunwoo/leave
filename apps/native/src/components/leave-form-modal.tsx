import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  balanceKeyToCategory,
  checkRegularOvernight,
  draftDaysByKey,
  draftsToSegments,
  fitDrafts,
  fmtDateShort,
  inclusiveDays,
  isRegularOvernightCycleBased,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  leaveCreateSchema,
  monthsSpanning,
  regularOvernightAvailableIn,
  regularOvernightBlockMessage,
  recommendDateRanges,
  removeDraft,
  resolveDrafts,
  segmentBalanceKey,
  segmentsToDrafts,
  setDraftEnd,
  splitLastDraft,
  todayInSeoul,
  type BalanceKey,
  type LeaveCreateInput,
  type LeaveStatus,
  type SegmentDraft,
  type SegmentLike,
} from "@leave/shared";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MyLeave } from "@/api/queries";
import {
  useCreateLeave,
  useCalendarDays,
  useLeaveBalances,
  useMe,
  useMyLeaves,
  useUpdateLeave,
} from "@/api/queries";
import { Button } from "./button";
import { DateRangePicker } from "./date-picker";
import { OfficialDisclaimer } from "./official-disclaimer";
import { NativeSegmentedControl } from "./segmented-control";
import { SegmentRow } from "./segment-row";
import { NativeBottomSheet } from "./native-bottom-sheet";
import { SheetScaffold } from "./sheet-scaffold";
import { colors, radius, spacing } from "@/theme";

/** 대안 날짜를 찾을 때 선택 구간 앞뒤로 살펴보는 일수. */
const RECOMMENDATION_RADIUS_DAYS = 14;

/** 폼에서 사용자가 직접 고를 수 있는 상태. 나머지는 서버·관리자 흐름에서 바뀐다. */
const STATUS_OPTIONS = ["draft", "shared", "requested", "approved"] as const;

export function LeaveFormModal(props: {
  visible: boolean;
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
}) {
  const editing = props.editing ?? null;
  const initialStartDate =
    editing?.startDate ?? props.initialDate ?? todayInSeoul();
  const initialEndDate =
    editing?.endDate ?? props.initialDate ?? initialStartDate;
  const balances = useLeaveBalances();
  const me = useMe();
  const myLeaves = useMyLeaves();
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() =>
    editing?.segments.length
      ? segmentsToDrafts(editing.segments)
      : fitDrafts([], initialStartDate, initialEndDate),
  );
  const [error, setError] = useState<string | null>(null);
  // 새 계획의 기본은 "희망"(익명 집계 반영). 초안은 나만 보고 집계에서 빠진다.
  const [status, setStatus] = useState<LeaveStatus>(editing?.status ?? "shared");
  // 추천은 선택 구간 밖 ±RECOMMENDATION_RADIUS_DAYS까지 살펴보므로, 그 범위가
  // 걸치는 달을 모두 받아야 월초·월말 후보가 빠지지 않는다.
  const calendarMonths = useMemo(
    () =>
      monthsSpanning(
        addDays(startDate, -RECOMMENDATION_RADIUS_DAYS),
        addDays(endDate >= startDate ? endDate : startDate, RECOMMENDATION_RADIUS_DAYS),
      ),
    [startDate, endDate],
  );
  const calendar = useCalendarDays(me.data?.unit?.id ?? null, calendarMonths);

  const create = useCreateLeave();
  const update = useUpdateLeave();
  const pending = create.isPending || update.isPending;
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const duration = validRange ? inclusiveDays(startDate, endDate) : 0;
  const selectedSimulation = useMemo(() => {
    if (!validRange || calendar.days.length === 0) return null;
    const stats = new Map(calendar.days.map((day) => [day.date, day]));
    let peak = 0;
    let exceeded = false;
    for (let index = 0; index < duration; index += 1) {
      const stat = stats.get(addDays(startDate, index));
      if (!stat || stat.allowed <= 0) return null;
      const countAfter = stat.count + (editing ? 0 : 1);
      peak = Math.max(peak, Math.round((countAfter / stat.allowed) * 100));
      exceeded ||= countAfter > stat.allowed;
    }
    return { peak, exceeded };
  }, [calendar.days, duration, editing, startDate, validRange]);
  /** 선택 구간이 블랙아웃에 걸리면 저장 전에 알려야 한다. */
  const blackoutWarning = useMemo(() => {
    if (!validRange) return false;
    const blocked = new Set(
      calendar.days.filter((day) => day.blocked).map((day) => day.date),
    );
    for (let index = 0; index < duration; index += 1) {
      if (blocked.has(addDays(startDate, index))) return true;
    }
    return false;
  }, [calendar.days, duration, startDate, validRange]);

  const recommendations = useMemo(() => {
    if (!validRange || calendar.days.length === 0) return [];
    return recommendDateRanges({
      days: calendar.days.map((day) => ({
        date: day.date,
        count: day.count + (editing ? 0 : 1),
        allowed: day.allowed,
      })),
      selectedStart: startDate,
      durationDays: duration,
      radiusDays: RECOMMENDATION_RADIUS_DAYS,
    });
  }, [calendar.days, duration, editing, startDate, validRange]);
  const resolved = useMemo(
    () => (validRange ? resolveDrafts(startDate, drafts) : []),
    [validRange, startDate, drafts],
  );

  /** 기간이 바뀌면 구간을 다시 맞춰 항상 전체를 덮게 한다. */
  const applyRange = (nextStart: string, nextEnd: string) => {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDrafts((current) => fitDrafts(current, nextStart, nextEnd));
  };

  // 남은 잔여량: 수정 중이면 이 휴가가 이미 쓰고 있던 몫을 되돌려준다.
  const remainingByKey = useMemo(() => {
    const result = new Map<BalanceKey, number>(
      (balances.data?.balances ?? []).map((item) => [
        item.key,
        item.remainingDays,
      ]),
    );
    for (const segment of editing?.segments ?? []) {
      const key = segmentBalanceKey(segment);
      result.set(key, (result.get(key) ?? 0) + segment.days);
    }
    return result;
  }, [balances.data, editing]);

  const regularConfig = balances.data?.regularOvernight ?? null;
  const cycleBased = isRegularOvernightCycleBased(regularConfig);
  const dischargeAt = me.data?.user.dischargeAt ?? "";

  // 이미 저장된 내 정기외박 구간. 수정 중이면 그 휴가 몫은 빼야 자기 자신과 부딪히지 않는다.
  const savedRegular = useMemo<SegmentLike[]>(
    () =>
      (myLeaves.data?.leaves ?? [])
        .filter((leave) => leave.id !== editing?.id)
        .flatMap((leave) => leave.segments),
    [myLeaves.data, editing],
  );

  // 폼이 이번에 정기외박으로 잡아둔 구간.
  const draftRegular = useMemo<SegmentLike[]>(
    () =>
      resolved
        .filter((draft) => draft.key === "regular_overnight")
        .map((draft) => ({
          ...balanceKeyToCategory(draft.key),
          startDate: draft.startDate,
          endDate: draft.endDate,
        })),
    [resolved],
  );

  // 주기 재원은 총합이 아니라 날짜가 속한 주기로 따진다.
  const regularBlock = useMemo(() => {
    if (!cycleBased || !dischargeAt || !draftRegular.length) return null;
    return checkRegularOvernight({
      config: regularConfig,
      existing: savedRegular,
      requested: draftRegular,
      dischargeAt,
    });
  }, [cycleBased, dischargeAt, regularConfig, savedRegular, draftRegular]);

  // 폼에서 이미 배정한 몫까지 뺀 실제 남은 일수(재원 선택 칩에 보여준다).
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    // 주기 재원은 스칼라 잔여가 "이번 주기" 값이라 미래 주기를 잘못 막는다.
    // 구간 행마다 그 날짜의 주기로 따로 계산한다(아래 rowAvailable).
    if (cycleBased) result.delete("regular_overnight");
    return result;
  }, [remainingByKey, validRange, startDate, drafts, cycleBased]);

  /** 이 구간 날짜가 속한 주기까지 반영한, 행 하나짜리 잔여 표. */
  const rowAvailable = (from: string, to: string) => {
    if (!cycleBased) return availableByKey;
    return new Map(availableByKey).set(
      "regular_overnight",
      regularOvernightAvailableIn({
        config: regularConfig,
        used: [...savedRegular, ...draftRegular],
        dischargeAt,
        from,
        to,
      }),
    );
  };

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const balanceBlockMessage = [
    ...overused.map(
      ([key, remaining]) =>
        `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
    ),
    ...(regularBlock ? [regularOvernightBlockMessage(regularBlock)] : []),
  ].join(", ");
  const submitBlocker = !validRange
    ? "시작일과 종료일을 확인해주세요."
    : drafts.length === 0
      ? "휴가 종류를 선택해주세요."
      : balanceBlockMessage || null;
  const lastDraft = resolved[resolved.length - 1];
  const splitAvailable = lastDraft
    ? rowAvailable(lastDraft.startDate, lastDraft.endDate)
    : null;
  const suggestedSplitKey =
    lastDraft && splitAvailable && lastDraft.days > 1
      ? BALANCE_KEYS.find(
          (key) => key !== lastDraft.key && (splitAvailable.get(key) ?? 0) >= 1,
        )
      : undefined;

  const submit = async () => {
    if (submitBlocker) return;

    const input: LeaveCreateInput = {
      // 자유 입력 제목·사유는 다른 구성원에게 불필요한 개인정보와 UGC를 만든다.
      // 서버 구버전과의 호환을 위해 종류에서 파생한 고정 제목만 보낸다.
      title: drafts[0] ? `${BALANCE_LABELS[drafts[0].key]} 계획` : "휴가 계획",
      status,
      segments: draftsToSegments(startDate, drafts),
    };
    const parsed = leaveCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    setError(null);
    try {
      const result = editing
        ? await update.mutateAsync({ id: editing.id, input: parsed.data })
        : await create.mutateAsync(parsed.data);
      props.onClose();
      if (result.exceededDates.length > 0) {
        const list = result.exceededDates.map(fmtDateShort).join(", ");
        Alert.alert(
          "참고 기준 초과",
          `저장은 완료됐지만 ${list}의 추정 출타 상태가 초과예요. 공식 가능 여부는 소속 부대에 확인하세요.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <NativeBottomSheet
      isPresented={props.visible}
      snapPoints={[{ fraction: 0.92 }, "full"]}
      onDismiss={props.onClose}
      testID="leave-form-sheet"
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <SheetScaffold
          title={editing ? "휴가 수정" : "휴가 등록"}
          onClose={props.onClose}
          closeTestID="leave-form-close"
          footer={
            <View style={styles.footerActions}>
              <Text
                style={[
                  styles.footerHint,
                  submitBlocker && styles.footerHintBlocked,
                ]}
                accessibilityLiveRegion="polite"
              >
                {submitBlocker ??
                  `${fmtDateShort(startDate)}부터 ${fmtDateShort(endDate)}까지 · ${duration}일`}
              </Text>
              <Button
                title={
                  pending ? "저장 중…" : editing ? "변경사항 저장" : "휴가 등록"
                }
                onPress={() => void submit()}
                loading={pending}
                testID="leave-form-submit"
              />
            </View>
          }
        >
          <OfficialDisclaimer />

          {blackoutWarning ? (
            <View style={styles.blackoutBox}>
              <Text style={styles.blackoutText} accessibilityRole="alert">
                이 기간에는 제한 기간(검열·훈련)이 등록돼 있어요. 출타율과
                무관하게 지휘관이 휴가를 제한할 수 있습니다.
              </Text>
            </View>
          ) : null}

          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={applyRange}
            testID="leave-date-range"
          />

          <View style={styles.simulationCard}>
            <Text selectable style={styles.simulationTitle}>
              계획 상태
            </Text>
            <NativeSegmentedControl
              values={STATUS_OPTIONS}
              labels={LEAVE_STATUS_LABELS}
              value={status as (typeof STATUS_OPTIONS)[number]}
              onValueChange={setStatus}
              testID="leave-status"
            />
            <Text selectable style={styles.statusHint}>
              {status === "draft"
                ? "초안은 나만 볼 수 있고 그룹 집계에 들어가지 않아요."
                : isConfirmedLeaveStatus(status)
                  ? "확정된 일정이에요. 달력에서 희망 일정과 구분해 보여줍니다."
                  : "희망 일정으로 익명 집계에 반영돼요. 누구인지는 드러나지 않습니다."}
            </Text>
          </View>

          <View style={styles.simulationCard}>
            <Text selectable style={styles.simulationTitle}>
              이 계획을 더하면
            </Text>
            <Text selectable style={styles.simulationValue}>
              {selectedSimulation
                ? `${selectedSimulation.exceeded ? "초과" : selectedSimulation.peak >= 80 ? "임박" : selectedSimulation.peak >= 50 ? "보통" : "여유"} · 구간 최고 ${selectedSimulation.peak}%`
                : "기준을 불러오는 중이거나 설정되지 않았어요"}
            </Text>
            {recommendations.length > 0 ? (
              <View style={styles.recommendations}>
                <Text selectable style={styles.recommendationHint}>
                  더 여유로운 인접 날짜
                </Text>
                {recommendations.map((range) => (
                  <Button
                    key={`${range.startDate}-${range.endDate}`}
                    title={`${fmtDateShort(range.startDate)} ~ ${fmtDateShort(range.endDate)} · 최고 ${range.peakPercent}%`}
                    variant="secondary"
                    size="sm"
                    onPress={() => applyRange(range.startDate, range.endDate)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.segmentCard}>
            <View style={styles.segmentHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.segmentTitle} selectable>
                  휴가 종류
                </Text>
                <Text style={styles.segmentHint} selectable>
                  기본은 기간 전체에 한 종류를 사용해요. 여러 종류를 이어서
                  사용한다면 구간을 나눌 수 있어요.
                </Text>
              </View>
              <Text style={styles.segmentTotal} selectable>
                {duration}일
              </Text>
            </View>

            {validRange ? (
              resolved.map((draft, index) => {
                const isLast = index === resolved.length - 1;
                // 뒤에 남은 구간 수만큼 최소 하루씩 남겨둬야 한다.
                const maxEnd = addDays(endDate, -(resolved.length - 1 - index));
                return (
                  <SegmentRow
                    key={index}
                    draft={draft}
                    isLast={isLast}
                    removable={resolved.length > 1}
                    maxEnd={maxEnd}
                    remainingByKey={rowAvailable(
                      draft.startDate,
                      draft.endDate,
                    )}
                    onChangeKey={(key) =>
                      setDrafts((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, key } : item,
                        ),
                      )
                    }
                    onChangeEnd={(date) =>
                      setDrafts((current) =>
                        setDraftEnd(current, index, date, startDate, endDate),
                      )
                    }
                    onRemove={() =>
                      setDrafts((current) =>
                        removeDraft(current, index, startDate, endDate),
                      )
                    }
                  />
                );
              })
            ) : (
              <Text style={styles.segmentHint}>
                시작일과 종료일을 먼저 골라주세요.
              </Text>
            )}

            {validRange && duration > drafts.length && suggestedSplitKey ? (
              <View style={styles.splitActions}>
                <Button
                  title="다른 휴가 종류 이어 쓰기"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    setDrafts((current) => {
                      const next = splitLastDraft(
                        current,
                        startDate,
                        endDate,
                        suggestedSplitKey,
                      );
                      // 새 종류는 1일부터 시작한다. 잔여가 적어도 추가할 수 있고,
                      // 사용자는 앞 구간의 마지막 날을 바꿔 원하는 만큼 늘릴 수 있다.
                      return next
                        ? setDraftEnd(
                            next,
                            next.length - 2,
                            addDays(endDate, -1),
                            startDate,
                            endDate,
                          )
                        : current;
                    })
                  }
                />
                <Text style={styles.splitHint} selectable>
                  추가한 뒤 각 종류의 마지막 날을 조정할 수 있어요.
                </Text>
              </View>
            ) : null}
          </View>

          {balanceBlockMessage ? (
            <Text
              selectable
              style={styles.error}
              accessibilityLiveRegion="assertive"
            >
              {balanceBlockMessage}
            </Text>
          ) : null}

          {error && (
            <Text
              selectable
              style={styles.error}
              accessibilityLiveRegion="assertive"
            >
              {error}
            </Text>
          )}
        </SheetScaffold>
      </KeyboardAvoidingView>
    </NativeBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  footerActions: { width: "100%", gap: spacing.sm },
  footerHint: {
    minHeight: 17,
    paddingHorizontal: spacing.xs,
    fontSize: 12,
    fontWeight: "600",
    color: colors.positiveDeep,
    textAlign: "center",
  },
  footerHintBlocked: { color: colors.body },
  segmentCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  simulationCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusHint: { fontSize: 12, lineHeight: 18, color: colors.mute },
  blackoutBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceCard,
  },
  blackoutText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: colors.warningContent,
  },
  simulationTitle: { fontSize: 12, fontWeight: "600", color: colors.body },
  simulationValue: { fontSize: 18, fontWeight: "700", color: colors.ink },
  recommendations: { gap: spacing.sm, paddingTop: spacing.xs },
  recommendationHint: { fontSize: 12, color: colors.body },
  segmentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  segmentTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  segmentHint: { fontSize: 12, color: colors.mute, paddingTop: 2 },
  segmentTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  splitActions: { gap: spacing.xs, paddingTop: spacing.xs },
  splitHint: { fontSize: 11, color: colors.mute, textAlign: "center" },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
});
