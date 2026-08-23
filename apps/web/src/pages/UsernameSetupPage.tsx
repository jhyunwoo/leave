/**
 * 1회성 사용자 이름 설정 — 0023 이전에 가입한 계정만 보는 화면.
 *
 * 사용처: App.tsx의 인증 게이트. 온보딩은 이미 마쳤는데
 * (`completed === true`) 공개 이름만 없는 상태(`username === null`)일 때 뜬다.
 *
 * 서버가 이름을 대신 지어 주지 않기 때문에 이 화면이 필요하다. 이메일 앞부분이나
 * 별칭에서 뽑으면 그 순간 비공개 정보가 공개 식별자가 되고, 무작위 문자열을
 * 넣으면 아무도 기억하지 못하는 이름이 남는다(migrations/0023 주석).
 *
 * 이름을 정하기 전까지 막히는 것은 친구 찾기·프로필 공유뿐이다. 그래서 "건너뛰기"를
 * 두지 않는다 — 건너뛸 수 있으면 이 화면이 매 세션마다 다시 뜨는 성가신 관문이 되고,
 * 정작 친구 탭은 계속 쓸 수 없다.
 */

import { useSetUsername } from "@leave/client";
import { useState } from "react";
import { BrandLockup } from "../components/BrandLockup";
import { UsernameField, useUsernameDraft } from "../components/UsernameField";

export function UsernameSetupPage() {
  const draft = useUsernameDraft();
  const setUsername = useSetUsername();
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.valid) return;
    setError(null);
    try {
      await setUsername.mutateAsync({ username: draft.username });
      // 성공하면 온보딩 상태가 무효화되고 게이트가 스스로 앱으로 넘어간다.
      // 여기서 직접 navigate하지 않는 이유: 딥링크로 들어온 사람은 원래 가려던
      // 주소(/u/...)에 그대로 남아 있어야 한다.
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-xl)",
        gap: "var(--sp-2xl)",
      }}
    >
      <BrandLockup iconSize={44} />
      <section
        className="card anim-rise"
        style={{
          width: "100%",
          maxWidth: 460,
          display: "grid",
          gap: "var(--sp-lg)",
        }}
      >
        <div>
          <h1 className="display-sm">사용자 이름을 정해주세요</h1>
          <p className="text-body" style={{ marginTop: "var(--sp-sm)" }}>
            친구가 나를 찾는 공개 이름이에요. 실명·군번·부대명은 쓰지 마세요.
          </p>
        </div>
        <UsernameField
          draft={draft}
          serverError={error}
          autoFocus
          onSubmit={() => void submit()}
          testId="username-setup-input"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!draft.valid || setUsername.isPending}
          onClick={() => void submit()}
          data-testid="username-setup-submit"
        >
          {setUsername.isPending ? "저장 중…" : "이 이름으로 시작하기"}
        </button>
      </section>
    </main>
  );
}
