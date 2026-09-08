/**
 * 네이티브 휴가 등록/수정 시트.
 *
 * 사용처: 캘린더 탭(날짜 탭), 내 휴가 탭(등록/수정).
 *
 * 폼의 규칙(구간 재배치·잔여 계산·정기외박 주기 검사·대안 날짜 추천)은 전부
 * `useLeaveForm`에 있고, 이 파일은 그 결과를 네이티브 위젯으로 그리기만 한다.
 * 같은 규칙을 웹도 쓴다(apps/web/src/components/LeaveFormModal.tsx).
 *
 * 웹과 다른 점: 등록할 때는 제목·사유를 묻지 않는다. 자유 입력은 다른 구성원에게
 * 불필요한 개인정보와 UGC를 만들기 때문에, 등록 제목은 휴가 종류에서 자동으로 만든다.
 * 다만 수정할 때는 제목을 고칠 수 있다 — 자동으로 지은 제목은 종류를 바꾸면 따라
 * 바뀌고, 한 번 직접 고친 이름은 그대로 남는다. 사유는 여전히 묻지 않는다.
 *
 * ## 넓은 시트에서는 상태와 시뮬레이션을 나란히 둔다
 *
 * "계획 상태"와 "이 계획을 더하면"은 함께 읽는 짝이다 — 초안으로 둘지 공유할지는
 * 그 계획이 그날을 얼마나 밀어 올리는지를 보고 정한다. 좁은 화면에서는 어쩔 수 없이
 * 위아래로 놓지만, 폭이 있으면 나란히 둬 스크롤 없이 같이 본다.
 *
 * 기준은 창 폭이 아니라 **시트 자신의 폭**이다. iPad의 `pageSheet`은 창이 1366이어도
 * 시트는 540 남짓이라, 창 폭을 믿고 두 열로 나누면 오히려 좁아진다.
 */
import { useLeaveForm, type LeaveResult, type MyLeave } from "@leave/client";
import {
  fmtDateShort,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  isDerivedTitle,
  LEAVE_STATUS_LABELS,
  titleFromDrafts,
  todayInSeoul,
  USER_EDITABLE_LEAVE_STATUSES,
  type LeaveStatus,
} from "@leave/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Text, View } from "react-native";
import { useMeasuredSizeClass } from "@/adaptive";
import { notify } from "@/lib/dialog";
import { layout, makeStyles, radius, spacing } from "@/theme";
import { Button } from "./button";
import { DateRangePicker } from "./date-picker";
import { Field, Input } from "./field";
import { FormSheet } from "./form-sheet";
import { OfficialDisclaimer } from "./official-disclaimer";
import { SegmentReorderList } from "./segment-reorder-list";
import { SegmentRow } from "./segment-row";
import { NativeSegmentedControl } from "./segmented-control";
import { SheetScaffold } from "./sheet-scaffold";

/** 계획 상태가 무슨 뜻인지 한 줄로 설명한다. */
function statusHint(status: LeaveStatus): string {
  if (status === "draft") {
    return "초안은 나만 볼 수 있고 그룹 집계와 출타 명단에 들어가지 않아요.";
  }
  if (isConfirmedLeaveStatus(status)) {
    return "확정된 일정이에요. 달력 출타 명단에 이름과 함께 보이고, 희망 일정과 구분해 표시됩니다.";
  }
  return "희망 일정이에요. 달력 출타 명단에 이름과 함께 같은 그룹 구성원에게 보여요.";
}

export function LeaveFormModal(props: {
  visible: boolean;
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
  // 붙어 있는 휴가에 흡수되면 저장된 휴가의 id가 요청한 id와 다를 수 있다.
  onSaved?: (result: LeaveResult) => void;
}) {
  const styles = useStyles();
  const sheet = useMeasuredSizeClass();
  // 구간을 끌고 있는 동안에는 시트 본문이 같이 스크롤되면 안 된다.
  const [reordering, setReordering] = useState(false);
  // 이미 손으로 지은 이름을 가진 휴가(웹에서 만든 것 등)는 처음부터 직접 입력으로 연다.
  const [renamed, setRenamed] = useState(
    () => !!props.editing && !isDerivedTitle(props.editing.title),
  );
  const form = useLeaveForm({
    // 네이티브는 날짜 선택기가 항상 유효한 날을 요구하므로 빈 값을 두지 않는다.
    initialDate: props.initialDate ?? todayInSeoul(),
    editing: props.editing,
    // 이름을 직접 고치기 전까지는 휴가 종류에서 제목을 만들어 쓴다.
    deriveTitle: renamed ? undefined : titleFromDrafts,
  });
  const { editing, startDate, endDate, duration, resolved, validRange } = form;
  // 자동 제목은 상태로 들고 있지 않고 그때그때 구간에서 만든다(저장 값과 같다).
  const shownTitle = renamed ? form.title : titleFromDrafts(form.drafts);

  const save = async () => {
    const result = await form.submit();
    if (!result) return;
    props.onSaved?.(result);
    props.onClose();
    // 저장은 됐지만 그날이 초과라면, 공식 승인 여부는 부대에 확인해야 한다.
    if (result.exceededDates.length > 0) {
      const list = result.exceededDates.map(fmtDateShort).join(", ");
      notify(
        "참고 기준 초과",
        `저장은 완료됐지만 ${list}의 추정 출타 상태가 초과예요. 공식 가능 여부는 소속 부대에 확인하세요.`,
      );
    }
  };

  return (
    <FormSheet
      isPresented={props.visible}
      onDismiss={props.onClose}
      testID="leave-form-sheet"
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
        onLayout={sheet.onLayout}
      >
        <SheetScaffold
          title={editing ? "휴가 수정" : "휴가 등록"}
          onClose={props.onClose}
          closeTestID="leave-form-close"
          scrollEnabled={!reordering}
          // 두 열을 펴려면 폼 한 벌 기준(560)보다는 넓어야 한다.
          contentMaxWidth={layout.readableContent}
          footer={
            <View style={styles.footerActions}>
              {/* 저장을 막는 이유가 있으면 그것을, 없으면 저장될 내용을 요약한다. */}
              <Text
                style={[
                  styles.footerHint,
                  form.submitBlocker && styles.footerHintBlocked,
                ]}
                accessibilityLiveRegion="polite"
              >
                {form.submitBlocker ??
                  `${fmtDateShort(startDate)}부터 ${fmtDateShort(endDate)}까지 · ${duration}일`}
              </Text>
              <Button
                title={
                  form.pending
                    ? "저장 중…"
                    : editing
                      ? "변경사항 저장"
                      : "휴가 등록"
                }
                onPress={() => void save()}
                loading={form.pending}
                testID="leave-form-submit"
              />
            </View>
          }
        >
          <OfficialDisclaimer />

          {form.blackoutWarning ? (
            <View style={styles.blackoutBox}>
              <Text style={styles.blackoutText} accessibilityRole="alert">
                이 기간에는 제한 기간(검열·훈련)이 등록돼 있어요. 출타율과
                무관하게 지휘관이 휴가를 제한할 수 있습니다.
              </Text>
            </View>
          ) : null}

          {/* 등록·수정 모두 제목을 보여준다. 비워 두면 휴가 종류를 따라 자동으로
              지어지므로 이름을 신경 쓰지 않아도 등록을 막지 않고, 손대는 순간부터는
              그 사람이 지은 이름으로 본다(위 renamed). */}
          <Field
            label="휴가 제목"
            hint={
              renamed
                ? undefined
                : "휴가 종류를 따라 자동으로 지어져요. 직접 고치면 그대로 유지돼요."
            }
          >
            <Input
              value={shownTitle}
              onChangeText={(text) => {
                setRenamed(true);
                form.setTitle(text);
              }}
              placeholder="예: 제주도 가족여행"
              maxLength={80}
              testID="leave-title"
            />
          </Field>

          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={form.applyRange}
            onChangeStart={form.moveToStart}
            unitEvents={form.unitEvents}
            testID="leave-date-range"
          />

          <Field label="복귀 시간" hint="휴가 종료일의 복귀 예정 시각이에요.">
            <Input
              value={form.returnTime}
              onChangeText={form.setReturnTime}
              placeholder="21:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              testID="leave-return-time"
            />
          </Field>

          <View style={sheet.isCompact ? styles.stack : styles.pairRow}>
            <View
              style={[
                styles.simulationCard,
                !sheet.isCompact && styles.pairItem,
              ]}
            >
              <Text selectable style={styles.simulationTitle}>
                계획 상태
              </Text>
              <NativeSegmentedControl
                values={USER_EDITABLE_LEAVE_STATUSES}
                labels={LEAVE_STATUS_LABELS}
                value={
                  form.status as (typeof USER_EDITABLE_LEAVE_STATUSES)[number]
                }
                onValueChange={form.setStatus}
                testID="leave-status"
              />
              <Text selectable style={styles.statusHint}>
                {statusHint(form.status)}
              </Text>
            </View>

            <View
              style={[
                styles.simulationCard,
                !sheet.isCompact && styles.pairItem,
              ]}
            >
              <Text selectable style={styles.simulationTitle}>
                이 계획을 더하면
              </Text>
              <Text selectable style={styles.simulationValue}>
                {form.selectedSimulation
                  ? `${form.selectedSimulation.label} · 구간 최고 ${form.selectedSimulation.peak}%`
                  : "기준을 불러오는 중이거나 설정되지 않았어요"}
              </Text>
              {form.recommendations.length > 0 ? (
                <View style={styles.recommendations}>
                  <Text selectable style={styles.recommendationHint}>
                    더 여유로운 인접 날짜
                  </Text>
                  {form.recommendations.map((range) => (
                    <Button
                      key={`${range.startDate}-${range.endDate}`}
                      // 하루짜리 추천이 대부분이다. 같은 날짜를 두 번 적으면 라벨이
                      // 길어져 버튼이 카드 밖으로 밀린다.
                      title={`${fmtRangeTiny(range.startDate, range.endDate)} · 최고 ${range.peakPercent}%`}
                      variant="secondary"
                      size="sm"
                      onPress={() =>
                        form.applyRange(range.startDate, range.endDate)
                      }
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.segmentCard}>
            <View style={styles.segmentHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.segmentTitle} selectable>
                  휴가 종류
                </Text>
                <Text style={styles.segmentHint} selectable>
                  종류마다 며칠 쓸지 고르면 날짜가 자동으로 정해져요. 순서를
                  바꾸려면 길게 눌러 끌어주세요.
                </Text>
              </View>
              <Text style={styles.segmentTotal} selectable>
                {duration}일
              </Text>
            </View>

            {validRange ? (
              <SegmentReorderList
                onReorder={form.moveDraft}
                onDragActiveChange={setReordering}
                testID="segment-list"
                items={resolved.map((draft, index) => (
                  <View key={index} style={styles.segmentWithCycle}>
                    <SegmentRow
                      draft={draft}
                      removable={resolved.length > 1}
                      remainingByKey={form.rowAvailable(
                        draft.startDate,
                        draft.endDate,
                      )}
                      onChangeKey={(key) =>
                        form.setDrafts((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, key } : item,
                          ),
                        )
                      }
                      onChangeDays={(days) => form.setDraftDays(index, days)}
                      onRemove={() => form.removeDraftAt(index)}
                    />
                    {draft.key === "regular_overnight" &&
                    (form.regularCycleChoices[index]?.length ?? 0) > 1 ? (
                      <View style={styles.cycleChoices}>
                        <Text style={styles.segmentHint}>
                          차감할 정기외박 주기
                        </Text>
                        {form.regularCycleChoices[index]!.map((cycle) => (
                          <Button
                            key={cycle.start}
                            title={`${cycle.index}주기 · ${fmtRangeTiny(cycle.start, cycle.end)}`}
                            variant={
                              draft.regularOvernightCycleStart === cycle.start
                                ? "primary"
                                : "secondary"
                            }
                            size="sm"
                            onPress={() =>
                              form.setRegularOvernightCycle(index, cycle.start)
                            }
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              />
            ) : (
              <Text style={styles.segmentHint}>시작일을 먼저 골라주세요.</Text>
            )}

            {validRange && form.suggestedAddKey ? (
              <View style={styles.splitActions}>
                <Button
                  title="다른 휴가 종류 이어 쓰기"
                  variant="secondary"
                  size="sm"
                  onPress={() => form.addDraft(form.suggestedAddKey!)}
                  testID="leave-add-segment"
                />
                <Text style={styles.splitHint} selectable>
                  하루로 붙어요. 추가한 뒤 개수를 조정하세요.
                </Text>
              </View>
            ) : null}
          </View>

          {form.balanceBlockMessage ? (
            <Text
              selectable
              style={styles.error}
              accessibilityLiveRegion="assertive"
            >
              {form.balanceBlockMessage}
            </Text>
          ) : null}

          {form.error && (
            <Text
              selectable
              style={styles.error}
              accessibilityLiveRegion="assertive"
            >
              {form.error}
            </Text>
          )}
        </SheetScaffold>
      </KeyboardAvoidingView>
    </FormSheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
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
  segmentWithCycle: { gap: spacing.sm },
  cycleChoices: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  stack: { gap: spacing.lg },
  // 두 카드가 같은 높이로 늘어나 짝처럼 보이게 한다(기본 alignItems: stretch).
  // flex는 여기서만 준다 — 세로로 쌓을 때 flex:1을 주면 카드가 세로로 늘어난다.
  pairRow: { flexDirection: "row", gap: spacing.lg },
  pairItem: { flex: 1, minWidth: 0 },
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
}));
