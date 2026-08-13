/**
 * 공유 그룹 단계 — 만들기 / 초대코드로 참여 / 나중에 (네이티브).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 그룹 만들기는 이름과 최대 인원 두 가지를 함께 받는다. 둘을 다시 쪼개면 아직
 * 존재하지도 않는 그룹의 정원을 먼저 정하게 돼 오히려 헷갈린다.
 */

import { unitCreateSchema, unitJoinSchema } from "@leave/shared";
import {
  useCreateUnit,
  useJoinUnit,
  type IssuedUnitInvite,
} from "@leave/client";
import { useState } from "react";
import { Share, Text } from "react-native";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { makeStyles, spacing } from "@/theme";
import { ChoiceCard } from "./choice-card";
import { StepError, StepNext, StepShell, StepSkip } from "./step-shell";

type Mode = "choice" | "join" | "create";

export function GroupStep(props: {
  /** 이미 그룹에 속해 있으면 참여를 다시 묻지 않는다. */
  inGroup: boolean;
  /** `joined`는 이 단계를 마친 뒤 실제로 그룹에 속했는지. 마지막 요약과 히어로
   *  노드가 이 값을 그대로 쓰므로 "나중에 하기"와 구분해서 넘겨야 한다. */
  onDone: (joined: boolean) => void;
}) {
  const styles = useStyles();
  const [mode, setMode] = useState<Mode>("choice");
  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [maxCount, setMaxCount] = useState("1");
  const [invite, setInvite] = useState<IssuedUnitInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();
  const join = useJoinUnit();

  const joinGroup = async () => {
    const parsed = unitJoinSchema.safeParse({ code });
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? "코드를 확인해주세요");
    setError(null);
    try {
      await join.mutateAsync(parsed.data);
      props.onDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "참여하지 못했습니다");
    }
  };

  const createGroup = async () => {
    const parsed = unitCreateSchema.safeParse({
      name: groupName,
      maxLeaveCount: Number(maxCount),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      );
    setError(null);
    try {
      setInvite((await create.mutateAsync(parsed.data)).invite);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "그룹을 만들지 못했습니다",
      );
    }
  };

  const share = () => {
    if (!invite) return;
    void Share.share({
      title: "리브 공유 그룹 초대",
      message: `리브에서 함께 휴가를 관리해요.\nhttps://leave.moveto.kr/invite#${invite.code}\n초대코드: ${invite.code}`,
    });
  };

  // 그룹을 막 만든 직후. 초대코드는 서버에 해시만 남으므로 이 화면을 벗어나면
  // 다시 볼 수 없다 — 그래서 "다음"이 아니라 공유가 주 행동이다.
  if (invite)
    return (
      <StepShell
        step="group"
        title="동료를 초대해보세요"
        lead="초대코드는 이 화면에서 한 번만 보여요."
      >
        <ContentPanel>
          <Text selectable style={styles.code} testID="onboarding-invite-code">
            {invite.code}
          </Text>
        </ContentPanel>
        <Text style={styles.fineprint}>
          {new Date(invite.expiresAt).toLocaleString("ko-KR")}까지 · 최대{" "}
          {invite.maxUses}회 · 서버에는 해시값만 저장됩니다.
        </Text>
        <StepNext label="안전하게 공유" onPress={share} />
        <StepSkip
          label="완료하고 시작하기"
          onPress={() => props.onDone(true)}
          testID="onboarding-invite-done"
        />
      </StepShell>
    );

  if (props.inGroup)
    return (
      <StepShell
        step="group"
        title="이미 함께 관리 중이에요"
        lead="현재 공유 그룹의 휴가 계획을 바로 이어서 관리할 수 있어요."
      >
        <StepNext label="다음" onPress={() => props.onDone(true)} />
      </StepShell>
    );

  return (
    <StepShell step="group">
      {mode === "choice" ? (
        <>
          <ChoiceCard
            asButton
            wide
            label="새 공유 그룹 만들기"
            caption="초대코드를 받아 동료에게 전달해요"
            onPress={() => setMode("create")}
            testID="onboarding-group-create"
          />
          <ChoiceCard
            asButton
            wide
            label="초대코드로 참여"
            caption="이미 만들어진 그룹에 들어가요"
            onPress={() => setMode("join")}
            testID="onboarding-group-join"
          />
          <ContentPanel>
            <Text style={styles.notice}>
              실제 부대명·부대번호·주소·병력 현황은 공유하지 마세요.
            </Text>
          </ContentPanel>
          <StepSkip
            label="나중에 하기"
            onPress={() => props.onDone(false)}
            testID="onboarding-group-skip"
          />
        </>
      ) : mode === "join" ? (
        <>
          <Field label="초대코드">
            <Input
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoFocus
              testID="onboarding-group-code"
            />
          </Field>
          <StepError message={error} />
          <StepNext
            label="그룹 참여"
            pending={join.isPending}
            onPress={() => void joinGroup()}
          />
          <StepSkip label="다른 방법 선택" onPress={() => setMode("choice")} />
        </>
      ) : (
        <>
          <Field label="공유 그룹 이름" hint="실제 부대명은 쓰지 마세요.">
            <Input
              value={groupName}
              onChangeText={setGroupName}
              placeholder="예: 여름 휴가방"
              autoFocus
              testID="onboarding-group-name"
            />
          </Field>
          <Field label="하루 최대 출타 인원">
            <Input
              value={maxCount}
              onChangeText={setMaxCount}
              keyboardType="number-pad"
              testID="onboarding-group-max"
            />
          </Field>
          <StepError message={error} />
          <StepNext
            label="그룹 만들기"
            pending={create.isPending}
            onPress={() => void createGroup()}
          />
          <StepSkip label="다른 방법 선택" onPress={() => setMode("choice")} />
        </>
      )}
    </StepShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  code: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    padding: spacing.md,
  },
  fineprint: { fontSize: 12, lineHeight: 18, color: colors.mute },
  notice: { fontSize: 13, lineHeight: 20, color: colors.body },
}));
