/**
 * 초대 링크 착지점 — `https://leave.moveto.kr/invite/{코드}`.
 *
 * 사용처: App.tsx의 `/invite/:code` 라우트. 로그인 여부와 무관하게 열려야 하므로
 * 인증 분기 **바깥**에 있다.
 *
 * ## 왜 커스텀 스킴으로 먼저 찔러 보는가
 *
 * 이 링크는 카카오톡·문자로 오간다. 앱이 깔려 있으면 OS가 Universal Link /
 * App Link로 가로채 앱을 여는 것이 정상 경로지만, **메신저 인앱 브라우저는 그
 * 가로채기를 하지 않는다.** 그 자리에서 앱으로 넘어갈 수 있는 유일한 방법이
 * `leave://invite/{코드}`로 한 번 이동을 시도하는 것이다. 앱이 없으면 아무 일도
 * 일어나지 않으므로, 잠깐 기다렸다가 웹 참여 화면을 그린다.
 *
 * ## 주소에서 코드를 지운다
 *
 * 코드를 잡자마자 주소를 `/invite`로 바꾼다. 그러지 않으면 방문 기록에 남고,
 * 이 화면을 그대로 공유하면 초대까지 함께 나간다(옛 `/invite#코드`가 같은 이유로
 * 하던 일이다). 링크 자체는 공유하라고 만든 것이지만, 그건 보낸 사람이 고르는
 * 일이지 받은 사람의 주소창이 대신 정할 일이 아니다.
 */

import { useJoinUnit, useMe } from "@leave/client";
import { inviteCodeFromUrl } from "@leave/shared";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { isAuthedAtom } from "../state/auth";
import { withNext } from "../state/next-destination";
import { rememberPendingInvite } from "../state/pending-invite";

/**
 * 앱이 받아 가기를 기다리는 시간.
 *
 * 앱이 열리면 이 탭은 배경으로 내려가고 타이머가 끝나도 사용자는 못 본다.
 * 앱이 없으면 이만큼 흰 화면을 보게 되므로 짧아야 한다.
 */
const APP_HANDOFF_MS = 1200;

/**
 * 이 화면은 페이지 전체를 차지한다. `main` 랜드마크가 없으면 보조기술과 브라우저
 * 에이전트에게 본문의 시작점이 없다(axe: landmark-one-main) — SignupPage와 같은 판단이다.
 */
function Shell(props: { children: ReactNode }) {
  return (
    <main
      className="anim-rise"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "var(--sp-2xl) var(--sp-lg) var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-md)",
      }}
    >
      {props.children}
    </main>
  );
}

export function InviteJoinPage() {
  const { code: raw } = useParams<{ code: string }>();
  const isAuthed = useAtomValue(isAuthedAtom);
  const [handoffDone, setHandoffDone] = useState(false);

  // 링크의 코드는 사람이 손으로 고칠 수 있다. 형식에 맞지 않으면 아무 그룹도
  // 가리키지 않으므로 화면을 띄우기 전에 걸러낸다.
  const code = inviteCodeFromUrl(`/invite/${raw ?? ""}`);

  useEffect(() => {
    if (!code) return;
    rememberPendingInvite(code);
    window.history.replaceState(null, "", "/invite");
    // 앱이 있으면 여기서 넘어간다. 없으면 아무 일도 일어나지 않는다.
    window.location.href = `leave://invite/${code}`;
    const timer = window.setTimeout(() => setHandoffDone(true), APP_HANDOFF_MS);
    return () => window.clearTimeout(timer);
  }, [code]);

  if (!code) {
    return (
      <Shell>
        <h1 className="display-sm">초대 링크를 확인할 수 없어요</h1>
        <p className="body-sm text-body">
          링크가 잘렸거나 만료됐을 수 있어요. 초대한 사람에게 다시 받아주세요.
        </p>
      </Shell>
    );
  }

  if (!handoffDone) {
    return (
      <Shell>
        <p className="body-sm text-body" role="status">
          앱으로 여는 중이에요…
        </p>
      </Shell>
    );
  }

  /*
   * 앱으로 넘어갈 틈을 준 뒤에 웹 흐름을 시작한다. 로그아웃 상태면 가입으로
   * 보내되, 끝난 뒤 이 주소로 되돌아오게 한다 — 온보딩은 주소를 덮어쓰지 않고
   * 그 위에 그려지므로 목적지가 살아남는다(App.tsx의 AuthedApp 주석).
   */
  if (!isAuthed) {
    return <Navigate to={withNext("/signup", `/invite/${code}`)} replace />;
  }

  return <AuthedInviteJoin code={code} />;
}

/**
 * 로그인한 사람의 참여 흐름. 별도 컴포넌트인 이유는 `useMe()`에 조건이 없기
 * 때문이다 — 로그아웃 상태에서 부르면 쓸데없는 401이 나가고, 그 응답이 세션
 * 정리 핸들러까지 건드린다. 인증된 가지 안에서만 마운트해 애초에 부르지 않는다.
 */
function AuthedInviteJoin(props: { code: string }) {
  const navigate = useNavigate();
  const me = useMe();
  const join = useJoinUnit();
  const [error, setError] = useState<string | null>(null);
  const joinStarted = useRef(false);

  /*
   * 이미 어느 그룹에 속해 있는가. 한 사람은 한 그룹에만 속한다.
   *
   * 이 확인이 필요한 이유는 로그아웃 상태로 들어온 사람의 경로 때문이다:
   * 코드를 세션에 담고 가입으로 보내면 **온보딩의 그룹 단계가 이미 참여시킨다.**
   * 그리고 `?next=`가 이 화면으로 되돌려 보내므로, 확인 없이 또 참여를 시도하면
   * 방금 성공한 사람에게 409 오류 문구가 뜬다.
   */
  const joinedUnit = me.data?.unit ?? null;

  useEffect(() => {
    // 소속 여부를 아직 모르는 동안에는 판단을 미룬다.
    if (me.isPending || joinedUnit || joinStarted.current) return;
    joinStarted.current = true;
    // 형식 검사는 `inviteCodeFromUrl`이 이미 했다 — 여기 오는 값은 정규형 코드다.
    void join
      .mutateAsync({ code: props.code })
      .then(() => {
        // SPA 안에서 이동한다. 전체 새로고침을 하면 방금 받아 둔 캐시를 버린다.
        void navigate("/units", { replace: true });
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "그룹에 참여하지 못했어요.",
        );
      });
  }, [props.code, join, navigate, me.isPending, joinedUnit]);

  if (joinedUnit) {
    return (
      <Shell>
        <h1 className="display-sm">이미 그룹에 있어요</h1>
        <p className="body-sm text-body">
          &lsquo;{joinedUnit.name}&rsquo; 그룹에 참여하고 있어요. 다른 그룹에
          들어가려면 먼저 지금 그룹에서 나가야 해요.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void navigate("/units", { replace: true })}
        >
          내 그룹 보기
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="display-sm">그룹에 참여하는 중이에요</h1>
      <p className="body-sm text-body" role="status">
        초대코드 {props.code}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Shell>
  );
}
