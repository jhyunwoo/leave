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
 */
import {
  isDerivedTitle,
  titleFromDrafts,
  useLeaveForm,
  type MyLeave,
} from "@leave/client";
import {
  addDays,
  fmtDateShort,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  removeDraft,
  setDraftEnd,
  splitLastDraft,
  todayInSeoul,
  type LeaveStatus,
} from "@leave/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Text, View } from "react-native";
import { notify } from "@/lib/dialog";
import { makeStyles, radius, spacing } from "@/theme";
import { Button } from "./button";
import { DateRangePicker } from "./date-picker";
import { Field, Input } from "./field";
import { FormSheet } from "./form-sheet";
import { OfficialDisclaimer } from "./official-disclaimer";
import { SegmentRow } from "./segment-row";
import { NativeSegmentedControl } from "./segmented-control";
import { SheetScaffold } from "./sheet-scaffold";

/** 폼에서 사용자가 직접 고를 수 있는 상태. 나머지는 서버·관리자 흐름에서 바뀐다. */
const STATUS_OPTIONS = [
  "draft",
  "shared",
  "requested",
  "approved",
] as const satisfies readonly LeaveStatus[];

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
}) {
  const styles = useStyles();
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
      >
        <SheetScaffold
          title={editing ? "휴가 수정" : "휴가 등록"}
          onClose={props.onClose}
          closeTestID="leave-form-close"
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

          {/* 등록은 종류에서 제목을 자동으로 만들고, 이름은 수정할 때 고친다. */}
          {editing ? (
            <Field
              label="휴가 제목"
              hint={
                renamed
                  ? undefined
                  : "지금은 휴가 종류를 따라 자동으로 지어져요. 직접 고치면 그대로 유지돼요."
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
          ) : null}

          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={form.applyRange}
            testID="leave-date-range"
          />

          <View style={styles.simulationCard}>
            <Text selectable style={styles.simulationTitle}>
              계획 상태
            </Text>
            <NativeSegmentedControl
              values={STATUS_OPTIONS}
              labels={LEAVE_STATUS_LABELS}
              value={form.status as (typeof STATUS_OPTIONS)[number]}
              onValueChange={form.setStatus}
              testID="leave-status"
            />
            <Text selectable style={styles.statusHint}>
              {statusHint(form.status)}
            </Text>
          </View>

          <View style={styles.simulationCard}>
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
              resolved.map((draft, index) => (
                <SegmentRow
                  key={index}
                  draft={draft}
                  isLast={index === resolved.length - 1}
                  removable={resolved.length > 1}
                  // 뒤에 남은 구간 수만큼 최소 하루씩 남겨둬야 한다.
                  maxEnd={addDays(endDate, -(resolved.length - 1 - index))}
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
                  onChangeEnd={(date) =>
                    form.setDrafts((current) =>
                      setDraftEnd(current, index, date, startDate, endDate),
                    )
                  }
                  onRemove={() =>
                    form.setDrafts((current) =>
                      removeDraft(current, index, startDate, endDate),
                    )
                  }
                />
              ))
            ) : (
              <Text style={styles.segmentHint}>
                시작일과 종료일을 먼저 골라주세요.
              </Text>
            )}

            {validRange &&
            duration > form.drafts.length &&
            form.suggestedSplitKey ? (
              <View style={styles.splitActions}>
                <Button
                  title="다른 휴가 종류 이어 쓰기"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    form.setDrafts((current) => {
                      const next = splitLastDraft(
                        current,
                        startDate,
                        endDate,
                        form.suggestedSplitKey!,
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
