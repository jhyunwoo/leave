/**
 * 공개 프로필 — `/u/{username}`. 친구 요청·수락·삭제와 공유된 일정이 여기 모인다.
 *
 * 사용처: App.tsx의 `/u/:username` (로그인 상태). 로그아웃 방문자는 로그인으로
 * 보내되 목적지를 잃지 않는다(App.tsx의 `RedirectToLogin` + `?next=`).
 *
 * 화면이 관계를 스스로 추론하지 않는다. 서버가 `relationship` 하나를 주고 그 값에
 * 따라 버튼이 정해진다 — 화면이 친구 목록을 뒤져 관계를 계산하면, 목록 캐시가
 * 낡은 동안 "친구 추가"를 눌러 이미 친구인 사람에게 요청을 보내게 된다.
 *
 * 친구가 아닐 때는 일정 섹션 자체를 렌더하지 않는다. 서버도 403을 주지만, 요청을
 * 아예 보내지 않는 편이 낫다 — 화면에 잠깐이라도 빈 일정 카드가 뜨면 "이 사람은
 * 휴가가 없다"는 잘못된 정보가 된다.
 */

import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriendSchedule,
  useRemoveFriend,
  useSendFriendRequest,
  useUserProfile,
  type UserProfile,
} from "@leave/client";
import {
  fmtRange,
  formatUsername,
  LEAVE_STATUS_LABELS,
  monthBounds,
  profileLink,
  shiftMonth,
  todayInSeoul,
} from "@leave/shared";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Avatar } from "../components/Avatar";

/**
 * 프로필 링크 공유.
 *
 * 공유하는 것은 커스텀 스킴이 아니라 언제나 HTTPS 정본 주소다. 앱이 깔려 있으면
 * Universal Link/App Link가 앱을 열고, 아니면 이 웹 화면이 열린다 — 받는 사람이
 * 앱을 깔았는지 보낸 사람이 알 수 없으므로 둘 다 되는 주소여야 한다.
 *
 * 공유 시트에 `title`을 주지 않는다. 대상 앱에 따라 그 값이 본문 앞에 붙어
 * `@hyunwoo https://…`가 되고, 그러면 붙여넣은 결과가 주소로 성립하지 않는다.
 * 클립보드 대체 경로와 같은 것이 나가야 한다(앱도 같은 판단 —
 * apps/native/src/components/profile-share-button.tsx).
 */
function ShareProfile(props: { username: string }) {
  const [copied, setCopied] = useState(false);
  const url = profileLink(props.username);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // 사용자가 공유 시트를 닫은 경우다. 복사로 넘어간다.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("프로필 링크를 복사하세요", url);
    }
  };

  return (
    <div style={{ display: "grid", gap: "var(--sp-xs)" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => void share()}
        data-testid="profile-share"
      >
        프로필 링크 공유
      </button>
      <p className="caption text-mute" role="status" aria-live="polite">
        {copied ? "링크를 복사했어요" : url.replace("https://", "")}
      </p>
    </div>
  );
}

function SharedSchedule(props: { userId: string }) {
  const current = todayInSeoul().slice(0, 7);
  const range = {
    startDate: monthBounds(shiftMonth(current, -1)).start,
    endDate: monthBounds(shiftMonth(current, 5)).end,
  };
  const schedule = useFriendSchedule(
    props.userId,
    range.startDate,
    range.endDate,
  );
  const navigate = useNavigate();

  return (
    <section
      className="card"
      style={{
        padding: "var(--sp-xl)",
        display: "grid",
        gap: "var(--sp-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--sp-md)",
          flexWrap: "wrap",
        }}
      >
        <h2 className="display-xs">공유된 휴가 일정</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() =>
            void navigate(`/?mode=friends&friends=${props.userId}`)
          }
        >
          내 달력과 비교
        </button>
      </div>
      {schedule.isPending ? (
        <div className="spinner" role="status" aria-label="일정 불러오는 중" />
      ) : schedule.isError ? (
        /* 재조회가 403이면 캐시에 남아 있던 본문도 지워진다
           (@leave/client의 watchFriendAccessRevocation). 여기서 data를 먼저
           보지 않는 것이 그 정리와 짝을 이룬다. */
        <p role="alert" className="field-error">
          일정을 볼 수 없어요. 친구 관계나 차단 상태를 확인해주세요.
        </p>
      ) : schedule.data?.leaves.length ? (
        schedule.data.leaves.map((leave) => (
          <div
            key={leave.leaveId}
            style={{
              padding: "var(--sp-md)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-md)",
            }}
          >
            <strong>{fmtRange(leave.startDate, leave.endDate)}</strong>
            <p className="caption text-mute">
              {LEAVE_STATUS_LABELS[leave.status]}
            </p>
          </div>
        ))
      ) : (
        <p className="text-body">이 기간에 공유된 휴가가 없어요.</p>
      )}
    </section>
  );
}

function RelationshipActions(props: {
  profile: UserProfile;
  onMessage: (message: string) => void;
}) {
  const { profile } = props;
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const remove = useRemoveFriend();
  const pending =
    send.isPending ||
    accept.isPending ||
    decline.isPending ||
    cancel.isPending ||
    remove.isPending;

  const run = async (work: Promise<unknown>, success: string) => {
    try {
      await work;
      props.onMessage(success);
    } catch (reason) {
      props.onMessage(
        reason instanceof Error ? reason.message : "요청을 처리하지 못했어요",
      );
    }
  };

  if (profile.relationship === "self") {
    return (
      <div style={{ display: "grid", gap: "var(--sp-sm)" }}>
        <p className="text-body">내 프로필이에요.</p>
        <Link to="/profile" className="btn btn-secondary">
          프로필 관리
        </Link>
        <ShareProfile username={profile.username} />
      </div>
    );
  }

  const buttons: Record<string, React.ReactNode> = {
    none: (
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          void run(
            send.mutateAsync({ username: profile.username }),
            "친구 요청을 보냈어요.",
          )
        }
        data-testid="profile-add-friend"
      >
        친구 추가
      </button>
    ),
    outgoing: (
      <>
        <span className="badge" aria-live="polite">
          요청함 · 수락 대기
        </span>
        <button
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            void run(cancel.mutateAsync(profile.userId), "요청을 취소했어요.")
          }
          data-testid="profile-cancel-request"
        >
          요청 취소
        </button>
      </>
    ),
    incoming: (
      <>
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            void run(accept.mutateAsync(profile.userId), "친구가 되었어요.")
          }
          data-testid="profile-accept"
        >
          수락
        </button>
        <button
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            void run(decline.mutateAsync(profile.userId), "요청을 거절했어요.")
          }
          data-testid="profile-decline"
        >
          거절
        </button>
      </>
    ),
    friends: (
      <>
        <span className="badge">친구</span>
        <button
          className="btn btn-danger"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`${profile.name}님을 친구에서 삭제할까요?`))
              void run(
                remove.mutateAsync(profile.userId),
                "친구를 삭제했어요.",
              );
          }}
          data-testid="profile-remove-friend"
        >
          친구 삭제
        </button>
      </>
    ),
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--sp-sm)",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {buttons[profile.relationship]}
      <ShareProfile username={profile.username} />
    </div>
  );
}

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const profile = useUserProfile(username);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div
      className="anim-rise"
      style={{
        padding: "var(--sp-xl) 0 var(--sp-3xl)",
        display: "grid",
        gap: "var(--sp-lg)",
        maxWidth: 640,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <Link to="/friends" className="caption">
        ← 친구
      </Link>

      {profile.isPending ? (
        <div
          className="spinner"
          role="status"
          aria-label="프로필 불러오는 중"
        />
      ) : profile.isError || !profile.data ? (
        <section className="card" style={{ padding: "var(--sp-xl)" }}>
          <h1 className="display-xs">사용자를 찾을 수 없어요</h1>
          <p className="text-body" style={{ marginTop: "var(--sp-sm)" }}>
            이름이 바뀌었거나 없는 계정이에요.
          </p>
        </section>
      ) : (
        <>
          <header
            style={{
              display: "flex",
              gap: "var(--sp-lg)",
              alignItems: "center",
            }}
          >
            <Avatar name={profile.data.name} size={64} />
            <div style={{ minWidth: 0 }}>
              <h1 className="display-md">{profile.data.name}</h1>
              <p className="caption text-mute">
                {formatUsername(profile.data.username)}
              </p>
            </div>
          </header>

          {message ? (
            <p
              role="status"
              className="card"
              style={{ padding: "var(--sp-md) var(--sp-lg)" }}
            >
              {message}
            </p>
          ) : null}

          <section
            className="card"
            style={{
              padding: "var(--sp-xl)",
              display: "grid",
              gap: "var(--sp-md)",
            }}
          >
            <RelationshipActions
              profile={profile.data}
              onMessage={setMessage}
            />
          </section>

          {profile.data.relationship === "friends" ? (
            <SharedSchedule userId={profile.data.userId} />
          ) : profile.data.relationship === "self" ? null : (
            <p className="text-body">
              친구가 되면 서로의 공유된 휴가 날짜를 볼 수 있어요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
