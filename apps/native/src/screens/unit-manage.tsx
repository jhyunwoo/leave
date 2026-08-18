/**
 * 그룹 관리 화면(네이티브, 관리자 전용).
 * 기본 정보와 하루 최대 출타 인원, 제한 기간(검열·훈련), 구성원과 초대코드,
 * 관리자 이관까지 그룹 운영에 필요한 조작을 한 화면에 모은다.
 *
 * 섹션이 많아 좁은 창에서는 한 줄로 길게 이어진다. 넓은 창(expanded)에서는 두
 * 열로 나눠 설정과 초대·제한 기간을 나란히 둔다 — 관리자는 값을 바꾸고 그
 * 결과(참여율·초대코드)를 함께 확인하는 일이 많다. medium에서는 폼 필드가 좁아져
 * 손해라 한 열을 유지한다. 참여자 목록은 길어질 수 있어 늘 전체 폭을 쓴다.
 */

import {
  fmtDateTimeFull,
  blackoutCreateSchema,
  fmtRangeTiny,
  todayInSeoul,
  unitUpdateSchema,
  type UnitUpdateInput,
} from "@leave/shared";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IssuedUnitInvite, Me } from "@leave/client";
import {
  useBlackouts,
  useBlockUser,
  useCreateBlackout,
  useCreateReport,
  useDeleteBlackout,
  useMe,
  useRemoveMember,
  useRotateUnitInvite,
  useTransferAdmin,
  useUnitMembers,
  useUpdateUnit,
} from "@leave/client";
import { ActionMenu } from "@/components/action-menu";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DateRangePicker } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
import { LeaveLimitFields } from "@/components/leave-limit-fields";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { confirmAction, notify } from "@/lib/dialog";
import { ResponsiveGrid, useWindowSizeClass } from "@/adaptive";
import { layout, makeStyles, radius, spacing, useColors } from "@/theme";

type Unit = NonNullable<Me["unit"]>;

async function shareInvite(invite: IssuedUnitInvite) {
  await Share.share({
    title: "리브 공유 그룹 초대",
    message: [
      "리브 앱에서 아래 초대코드를 입력하세요.",
      invite.code,
      `만료: ${fmtDateTimeFull(invite.expiresAt)}`,
      "실제 부대명·부대번호·주소·병력 현황은 입력하지 마세요.",
    ].join("\n\n"),
  });
}

export function UnitManageScreen() {
  const styles = useStyles();
  const colors = useColors();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const { sizeClass, isExpanded } = useWindowSizeClass();
  const unit = me.data?.unit ?? null;
  const isAdmin = unit != null && me.data?.user.id === unit.adminId;

  if (me.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  if (!me.data || !unit || !isAdmin) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <Text style={styles.forbidden}>관리자만 볼 수 있는 화면이에요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        width: "100%",
        maxWidth: isExpanded ? layout.workspaceContent : layout.readableContent,
        alignSelf: "center",
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxxl,
        gap: spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.lead}>
        그룹 내부 별칭과 계산 참고값만 관리합니다. 실제 부대 정보는 입력하지
        마세요.
      </Text>
      <OfficialDisclaimer compact />
      <ResponsiveGrid
        sizeClass={sizeClass}
        columns={{ compact: 1, medium: 1, expanded: 2 }}
      >
        <ParticipationSection unit={unit} />
        <EditUnitSection unit={unit} />
        <InviteSection unit={unit} />
        <BlackoutSection unit={unit} />
      </ResponsiveGrid>
      <MembersSection me={me.data} unit={unit} />
    </ScrollView>
  );
}

function ParticipationSection({ unit }: { unit: Unit }) {
  const styles = useStyles();
  const reference = unit.referenceMemberTotal;
  const participation =
    reference && reference > 0
      ? Math.min(100, Math.round((unit.memberCount / reference) * 100))
      : null;
  const low = participation !== null && participation < 70;

  return (
    <ContentPanel tone={low ? "danger" : "accent"} style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>데이터 신뢰도</Text>
        <Badge
          text={
            participation === null ? "기준값 미설정" : `참여 ${participation}%`
          }
          kind={low ? "negative" : "positive"}
        />
      </View>
      <Text style={styles.body}>
        {participation === null
          ? "계산 기준 인원을 설정해야 참여율을 보여줄 수 있습니다."
          : low
            ? "참여율이 70% 미만입니다. 앱에 없는 일정 때문에 실제 출타율은 더 높을 수 있습니다."
            : "참여율과 출타율 모두 관리자가 입력한 참고값이며 공식 기록이 아닙니다."}
      </Text>
      {unit.lastTotalUpdatedAt ? (
        <Text style={styles.meta}>
          기준 인원 마지막 갱신: {fmtDateTimeFull(unit.lastTotalUpdatedAt)}
        </Text>
      ) : null}
    </ContentPanel>
  );
}

function EditUnitSection({ unit }: { unit: Unit }) {
  const styles = useStyles();
  const update = useUpdateUnit(unit.id);
  const [name, setName] = useState(unit.name);
  const [referenceTotal, setReferenceTotal] = useState(
    unit.referenceMemberTotal == null ? "" : String(unit.referenceMemberTotal),
  );
  const [maxCount, setMaxCount] = useState(String(unit.maxLeaveCount));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    setError(null);
    setSaved(false);
    const input = {
      name: name.trim(),
      description: null,
      referenceMemberTotal:
        referenceTotal.trim() === "" ? null : Number(referenceTotal),
      maxLeaveCount: maxCount.trim() === "" ? Number.NaN : Number(maxCount),
    } satisfies UnitUpdateInput;
    const parsed = unitUpdateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      setSaved(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "저장하지 못했어요",
      );
    }
  };

  return (
    <ContentPanel style={styles.card}>
      <Text style={styles.sectionTitle}>그룹 설정</Text>
      <Field
        label="그룹 안에서만 보이는 별칭"
        hint="검색·색인되지 않습니다. 실제 부대명이나 고유번호를 쓰지 마세요."
      >
        <Input value={name} onChangeText={setName} maxLength={80} />
      </Field>
      <Field
        label="계산 기준 인원 (선택)"
        hint="실제 편제·정원이 아닌 임의의 참고값입니다."
      >
        <Input
          value={referenceTotal}
          onChangeText={setReferenceTotal}
          keyboardType="number-pad"
          accessibilityLabel="계산 기준 인원"
        />
      </Field>
      <LeaveLimitFields count={maxCount} onCountChange={setMaxCount} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.saved}>저장했어요.</Text> : null}
      <Button
        title={update.isPending ? "저장 중…" : "변경사항 저장"}
        loading={update.isPending}
        onPress={() => void submit()}
      />
    </ContentPanel>
  );
}

function InviteSection({ unit }: { unit: Unit }) {
  const styles = useStyles();
  const rotate = useRotateUnitInvite(unit.id);
  const [invite, setInvite] = useState<IssuedUnitInvite | null>(null);

  const issue = async () => {
    const confirmed = await confirmAction({
      title: "새 초대코드 발급",
      message:
        "기존 초대코드는 즉시 폐기됩니다. 새 코드는 이 화면에서 한 번만 확인할 수 있어요.",
      confirmLabel: "발급",
    });
    if (!confirmed) return;
    try {
      const result = await rotate.mutateAsync({});
      setInvite(result.invite);
    } catch (error) {
      notify(
        "발급 실패",
        error instanceof Error
          ? error.message
          : "초대코드를 발급하지 못했어요.",
      );
    }
  };

  return (
    <ContentPanel style={styles.card}>
      <Text style={styles.sectionTitle}>초대코드</Text>
      <Text style={styles.body}>
        그룹은 검색할 수 없습니다. 만료·횟수 제한이 있는 코드를 필요한
        사람에게만 전달하세요.
      </Text>
      {invite ? (
        <>
          <Text
            selectable
            accessibilityLabel="발급된 초대코드"
            style={styles.code}
          >
            {invite.code}
          </Text>
          <Text style={styles.meta}>
            {fmtDateTimeFull(invite.expiresAt)}까지 · 최대 {invite.maxUses}회
          </Text>
          <Button
            title="안전하게 공유"
            onPress={() => void shareInvite(invite)}
          />
        </>
      ) : null}
      <Button
        title={rotate.isPending ? "발급 중…" : "새 코드 발급·기존 코드 폐기"}
        variant="secondary"
        loading={rotate.isPending}
        onPress={() => void issue()}
      />
    </ContentPanel>
  );
}

/**
 * 검열·훈련처럼 출타율과 무관하게 휴가가 제한될 수 있는 기간.
 * 이게 없으면 앱은 "가능"이라 했는데 현실은 불가인 상황이 반복된다.
 */
function BlackoutSection({ unit }: { unit: Unit }) {
  const styles = useStyles();
  const list = useBlackouts(unit.id);
  const create = useCreateBlackout(unit.id);
  const remove = useDeleteBlackout(unit.id);
  const [startDate, setStartDate] = useState(todayInSeoul());
  const [endDate, setEndDate] = useState(todayInSeoul());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const parsed = blackoutCreateSchema.safeParse({
      startDate,
      endDate,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      setReason("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "등록하지 못했어요",
      );
    }
  };

  return (
    <ContentPanel style={styles.card}>
      <Text style={styles.sectionTitle}>제한 기간</Text>
      <Text style={styles.body}>
        검열·훈련·평가처럼 출타율과 무관하게 휴가가 제한될 수 있는 기간을
        등록하면, 참여자 달력에 &quot;제한 가능&quot;으로 표시됩니다.
      </Text>
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(nextStart, nextEnd) => {
          setStartDate(nextStart);
          setEndDate(nextEnd);
        }}
        testID="blackout-range"
      />
      <Field label="사유 (선택)" hint="작전·훈련 세부 내용은 적지 마세요.">
        <Input
          value={reason}
          onChangeText={setReason}
          placeholder="예: 정기 검열"
          maxLength={200}
        />
      </Field>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title={create.isPending ? "등록 중…" : "제한 기간 등록"}
        variant="secondary"
        loading={create.isPending}
        onPress={() => void submit()}
        testID="blackout-submit"
      />
      {list.data?.blackouts.map((blackout) => (
        <View key={blackout.id} style={styles.personRow}>
          <Text style={styles.personName}>
            {fmtRangeTiny(blackout.startDate, blackout.endDate)}
            {blackout.reason ? ` · ${blackout.reason}` : ""}
          </Text>
          <Button
            title="삭제"
            variant="danger"
            size="sm"
            loading={remove.isPending}
            onPress={() => void remove.mutateAsync(blackout.id)}
          />
        </View>
      ))}
    </ContentPanel>
  );
}

function MembersSection({ me, unit }: { me: Me; unit: Unit }) {
  const styles = useStyles();
  const colors = useColors();
  const members = useUnitMembers(unit.id);
  const transfer = useTransferAdmin(unit.id);
  const remove = useRemoveMember(unit.id);
  const block = useBlockUser();
  const report = useCreateReport();
  const list = members.data?.members ?? [];

  const doTransfer = async (userId: string, alias: string) => {
    const confirmed = await confirmAction({
      title: "관리자 위임",
      message: `${alias}님에게 관리자를 넘길까요? 넘긴 뒤에는 이 화면을 볼 수 없습니다.`,
      confirmLabel: "위임",
    });
    if (confirmed) await transfer.mutateAsync({ userId });
  };
  const doRemove = async (userId: string, alias: string) => {
    const confirmed = await confirmAction({
      title: "참여자 내보내기",
      message: `${alias}님을 그룹에서 내보낼까요?`,
      confirmLabel: "내보내기",
      destructive: true,
    });
    if (confirmed) await remove.mutateAsync(userId);
  };
  /** 차단은 이 목록에서만 숨긴다. 출타 집계는 그대로라 숫자가 흔들리지 않는다. */
  const doBlock = async (userId: string, alias: string) => {
    const confirmed = await confirmAction({
      title: "참여자 차단",
      message: `${alias}님을 차단할까요? 참여자 목록에서 보이지 않게 되며, 출타 집계에는 그대로 반영됩니다.`,
      confirmLabel: "차단",
      destructive: true,
    });
    if (confirmed) await block.mutateAsync({ userId });
  };
  const doReport = async (userId: string, alias: string) => {
    const confirmed = await confirmAction({
      title: "별칭 신고",
      message: `${alias}님의 별칭에 실명·군번·계급 등이 들어 있나요? 24시간 안에 검토합니다.`,
      confirmLabel: "신고",
    });
    if (!confirmed) return;
    try {
      await report.mutateAsync({
        targetType: "member",
        targetId: userId,
        reason: "personal_info",
      });
      notify("접수했어요", "24시간 안에 검토하겠습니다.");
    } catch (error) {
      notify(
        "접수 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <ContentPanel style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>참여자</Text>
        <Text style={styles.meta}>{list.length}명</Text>
      </View>
      <Text style={styles.body}>
        별칭만 표시합니다. 실명·계급·군번은 입력하거나 요구하지 마세요.
      </Text>
      {members.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <View style={styles.memberList}>
          {list.map((member) => {
            const isSelf = member.id === me.user.id;
            const isUnitAdmin = member.id === unit.adminId;
            return (
              <View key={member.id} style={styles.personRow}>
                <View style={styles.aliasMark} accessibilityElementsHidden>
                  <Text style={styles.aliasMarkText}>
                    {member.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.personName}>
                  {member.name}
                  {isSelf ? " (나)" : ""}
                </Text>
                {isUnitAdmin ? (
                  <Badge text="관리자" kind="positive" />
                ) : (
                  <ActionMenu
                    label={`${member.name} 참여자 작업`}
                    buttonLabel="관리"
                    actions={[
                      {
                        id: "transfer",
                        title: "관리자 위임",
                        systemImage: "person.badge.key",
                        disabled: transfer.isPending,
                        onPress: () => void doTransfer(member.id, member.name),
                      },
                      {
                        id: "report",
                        title: "별칭 신고",
                        systemImage: "exclamationmark.bubble",
                        disabled: report.isPending,
                        onPress: () => void doReport(member.id, member.name),
                      },
                      {
                        id: "block",
                        title: "차단",
                        systemImage: "hand.raised",
                        destructive: true,
                        disabled: block.isPending,
                        onPress: () => void doBlock(member.id, member.name),
                      },
                      {
                        id: "remove",
                        title: "그룹에서 내보내기",
                        systemImage: "person.crop.circle.badge.minus",
                        destructive: true,
                        disabled: remove.isPending,
                        onPress: () => void doRemove(member.id, member.name),
                      },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </ContentPanel>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  forbidden: { fontSize: 16, color: colors.body, textAlign: "center" },
  lead: { fontSize: 14, lineHeight: 21, color: colors.body },
  card: { padding: spacing.xl, gap: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  body: { fontSize: 14, lineHeight: 21, color: colors.body },
  meta: { fontSize: 12, lineHeight: 18, color: colors.mute },
  code: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvasSoft,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  saved: { fontSize: 13, fontWeight: "600", color: colors.positiveDeep },
  loading: { padding: spacing.xl, alignItems: "center" },
  memberList: { gap: spacing.md },
  personRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  aliasMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  aliasMarkText: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  personName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
}));
