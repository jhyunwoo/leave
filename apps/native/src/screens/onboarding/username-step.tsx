/**
 * 온보딩의 공개 사용자 이름 단계 (네이티브).
 *
 * 앞 단계들과 달리 이 단계는 **그 자리에서 서버에 쓴다.** 이름은 유일해야 하므로
 * "부모가 들고 있다가 마지막에 한 번에 저장"이 성립하지 않는다 — 그 사이에 남이
 * 같은 이름을 가져가면 이미 지나온 화면으로 되돌려 다시 물어야 한다.
 */

import { useSetUsername } from "@leave/client";
import { useState } from "react";
import { UsernameField, useUsernameDraft } from "@/components/username-field";
import { StepNext, StepShell } from "./step-shell";

export function UsernameStep(props: {
  initial: string;
  onSaved: (username: string) => void;
}) {
  const draft = useUsernameDraft(props.initial);
  const setUsername = useSetUsername();
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.valid) return;
    setError(null);
    try {
      await setUsername.mutateAsync({ username: draft.username });
      props.onSaved(draft.username);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <StepShell step="username">
      <UsernameField
        draft={draft}
        serverError={error}
        autoFocus
        onSubmit={() => void submit()}
        testID="onboarding-username"
      />
      <StepNext
        disabled={!draft.valid}
        pending={setUsername.isPending}
        onPress={() => void submit()}
      />
    </StepShell>
  );
}
