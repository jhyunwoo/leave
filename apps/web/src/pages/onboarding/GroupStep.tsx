/**
 * 공유 그룹 단계 — 만들기 / 초대코드로 참여 / 나중에.
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 초대 링크를 타고 온 사람은 코드가 미리 채워져 있어 곧장 참여 모드로 연다.
 * 여기서 되묻는 건 이미 답한 걸 다시 묻는 셈이다.
 *
 * 그룹 만들기는 이름과 최대 인원 두 가지를 받는다. 둘을 다시 쪼개면 아직
 * 존재하지도 않는 그룹의 정원을 먼저 정하게 돼 오히려 헷갈린다.
 */

import {
  fmtDateTimeFull,
  inviteLink,
  unitCreateSchema,
  unitJoinSchema,
} from "@leave/shared";
import {
  useCreateUnit,
  useJoinUnit,
  type IssuedUnitInvite,
} from "@leave/client";
import { useState } from "react";
import { Field } from "../../components/Field";
import { StepError, StepNext, StepShell, StepSkip } from "./StepShell";

type Mode = "choice" | "join" | "create";

export function GroupStep(props: {
  /** 초대 링크로 들어와 미리 채워진 코드. */
  pendingCode: string;
  /** 이미 그룹에 속해 있으면 참여를 다시 묻지 않는다. */
  inGroup: boolean;
  /** `joined`는 이 단계를 마친 뒤 실제로 그룹에 속했는지. 마지막 요약과 히어로
   *  노드가 이 값을 그대로 쓰므로 "나중에 하기"와 구분해서 넘겨야 한다. */
  onDone: (joined: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>(props.pendingCode ? "join" : "choice");
  const [code, setCode] = useState(props.pendingCode);
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
      setError(
        caught instanceof Error ? caught.message : "참여하지 못했습니다",
      );
    }
  };

  const createGroup = async () => {
    const parsed = unitCreateSchema.safeParse({
      name: groupName,
      // 빈 칸은 Number("")로 0이 되고 스키마의 min(0)을 통과해 최대 0명짜리
      // 그룹이 조용히 만들어진다. NaN으로 보내 "입력해주세요"가 뜨게 한다
      // — 그룹 관리 화면들이 쓰는 것과 같은 방식이다.
      maxLeaveCount: maxCount.trim() === "" ? Number.NaN : Number(maxCount),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      );
    setError(null);
    try {
      const result = await create.mutateAsync(parsed.data);
      setInvite(result.invite);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "그룹을 만들지 못했습니다",
      );
    }
  };

  const share = async () => {
    if (!invite) return;
    const text = `리브에서 함께 휴가를 관리해요.\n${inviteLink(invite.code)}\n초대코드: ${invite.code}`;
    if (navigator.share)
      await navigator.share({ title: "리브 공유 그룹 초대", text });
    else await navigator.clipboard.writeText(text);
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
        <div className="ob-invite" data-testid="onboarding-invite-code">
          {invite.code}
        </div>
        <p className="ob-fineprint">
          {fmtDateTimeFull(invite.expiresAt)}까지 · 최대 {invite.maxUses}회 ·
          서버에는 해시값만 저장됩니다.
        </p>
        <StepNext label="안전하게 공유" onClick={() => void share()} />
        <StepSkip
          label="코드 복사"
          onClick={() => void navigator.clipboard.writeText(invite.code)}
        />
        <StepSkip
          label="완료하고 시작하기"
          onClick={() => props.onDone(true)}
          testId="onboarding-invite-done"
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
        <StepNext label="다음" onClick={() => props.onDone(true)} />
      </StepShell>
    );

  return (
    <StepShell step="group">
      {mode === "choice" ? (
        <div className="ob-choices">
          <button
            type="button"
            className="ob-choice is-wide"
            onClick={() => setMode("create")}
            data-testid="onboarding-group-create"
          >
            <strong>새 공유 그룹 만들기</strong>
            <span>초대코드를 받아 동료에게 전달해요</span>
          </button>
          <button
            type="button"
            className="ob-choice is-wide"
            onClick={() => setMode("join")}
            data-testid="onboarding-group-join"
          >
            <strong>초대코드로 참여</strong>
            <span>이미 만들어진 그룹에 들어가요</span>
          </button>
        </div>
      ) : mode === "join" ? (
        <>
          <Field label="초대코드">
            <input
              className="input ob-input-lg"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              data-testid="onboarding-group-code"
            />
          </Field>
          <StepError message={error} />
          <StepNext
            label="그룹 참여"
            pending={join.isPending}
            onClick={() => void joinGroup()}
          />
          <StepSkip label="다른 방법 선택" onClick={() => setMode("choice")} />
        </>
      ) : (
        <>
          <Field label="공유 그룹 이름" hint="실제 부대명은 쓰지 마세요.">
            <input
              className="input ob-input-lg"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="예: 여름 휴가방"
              autoFocus
              data-testid="onboarding-group-name"
            />
          </Field>
          <Field label="하루 최대 출타 인원">
            <input
              className="input"
              type="number"
              min="0"
              value={maxCount}
              onChange={(e) => setMaxCount(e.target.value)}
              data-testid="onboarding-group-max"
            />
          </Field>
          <StepError message={error} />
          <StepNext
            label="그룹 만들기"
            pending={create.isPending}
            onClick={() => void createGroup()}
          />
          <StepSkip label="다른 방법 선택" onClick={() => setMode("choice")} />
        </>
      )}

      {mode === "choice" && (
        <>
          <div className="ob-notice">
            실제 부대명·부대번호·주소·병력 현황은 공유하지 마세요.
          </div>
          <StepSkip
            label="나중에 하기"
            onClick={() => props.onDone(false)}
            testId="onboarding-group-skip"
          />
        </>
      )}
    </StepShell>
  );
}
