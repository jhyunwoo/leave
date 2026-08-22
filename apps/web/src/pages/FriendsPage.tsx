import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  useIncomingFriendRequests,
  useOutgoingFriendRequests,
  useRemoveFriend,
  useSendFriendRequest,
} from "@leave/client";
import { MAX_FRIEND_CALENDAR_SELECTION } from "@leave/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="card"
      style={{ padding: "var(--sp-xl)", display: "grid", gap: "var(--sp-md)" }}
    >
      <h2 className="display-xs">{props.title}</h2>
      {props.children}
    </section>
  );
}

export function FriendsPage() {
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const outgoing = useOutgoingFriendRequests();
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const remove = useRemoveFriend();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const pending =
    send.isPending ||
    accept.isPending ||
    decline.isPending ||
    cancel.isPending ||
    remove.isPending;

  const run = async (work: Promise<unknown>, success: string) => {
    try {
      await work;
      setMessage(success);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "요청을 처리하지 못했어요",
      );
    }
  };

  return (
    <div
      className="anim-rise"
      style={{
        padding: "var(--sp-xl) 0 var(--sp-3xl)",
        display: "grid",
        gap: "var(--sp-lg)",
      }}
    >
      <header>
        <h1 className="display-md">친구</h1>
        <p className="text-body" style={{ marginTop: "var(--sp-sm)" }}>
          서로 수락한 친구끼리 공유 상태의 휴가 날짜만 비교해요.
        </p>
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
      <Section title="친구 추가">
        <form
          style={{ display: "flex", gap: "var(--sp-sm)", flexWrap: "wrap" }}
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              send.mutateAsync({ email }).then(() => setEmail("")),
              "친구 요청을 보냈어요.",
            );
          }}
        >
          <label className="field" style={{ flex: "1 1 260px" }}>
            <span className="field-label">정확한 가입 이메일</span>
            <input
              className="input"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="friend@example.com"
            />
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={pending || !email.trim()}
            style={{ alignSelf: "end" }}
          >
            요청 보내기
          </button>
        </form>
        <p className="field-hint">
          이메일은 정확히 일치해야 하며 공개 사용자 검색은 제공하지 않아요.
        </p>
      </Section>

      {(incoming.data?.requests.length ?? 0) > 0 ? (
        <Section title="받은 요청">
          {incoming.data!.requests.map((request) => (
            <div
              key={request.userId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--sp-md)",
                flexWrap: "wrap",
              }}
            >
              <strong>{request.name}</strong>
              <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      accept.mutateAsync(request.userId),
                      "친구가 되었어요.",
                    )
                  }
                >
                  수락
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      decline.mutateAsync(request.userId),
                      "요청을 거절했어요.",
                    )
                  }
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </Section>
      ) : null}
      {(outgoing.data?.requests.length ?? 0) > 0 ? (
        <Section title="보낸 요청">
          {outgoing.data!.requests.map((request) => (
            <div
              key={request.userId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--sp-md)",
              }}
            >
              <span>{request.name} · 수락 대기</span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pending}
                onClick={() =>
                  void run(
                    cancel.mutateAsync(request.userId),
                    "요청을 취소했어요.",
                  )
                }
              >
                취소
              </button>
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="내 친구">
        {friends.isPending ? (
          <div className="spinner" aria-label="친구 불러오는 중" />
        ) : friends.isError ? (
          <p role="alert" className="field-error">
            친구 목록을 불러오지 못했어요.
          </p>
        ) : friends.data?.friends.length ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--sp-md)",
                flexWrap: "wrap",
              }}
            >
              <strong aria-live="polite">
                {selected.length} / {MAX_FRIEND_CALENDAR_SELECTION} 선택
              </strong>
              <button
                className="btn btn-primary"
                disabled={selected.length === 0}
                onClick={() =>
                  void navigate(`/?mode=friends&friends=${selected.join(",")}`)
                }
              >
                선택한 친구와 달력 보기
              </button>
            </div>
            <div style={{ display: "grid", gap: "var(--sp-sm)" }}>
              {friends.data.friends.map((friend) => {
                const checked = selected.includes(friend.userId);
                const limitReached =
                  selected.length >= MAX_FRIEND_CALENDAR_SELECTION && !checked;
                return (
                  <div
                    key={friend.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--sp-md)",
                      padding: "var(--sp-md)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "var(--r-md)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={limitReached}
                      aria-label={`${friend.name} 선택${limitReached ? ", 최대 10명까지 선택 가능" : ""}`}
                      onChange={() =>
                        setSelected((current) =>
                          checked
                            ? current.filter((id) => id !== friend.userId)
                            : [...current, friend.userId],
                        )
                      }
                      style={{ width: 20, height: 20 }}
                    />
                    <Link
                      to={`/friends/${friend.userId}`}
                      style={{ flex: 1, fontWeight: 700 }}
                    >
                      {friend.name}
                    </Link>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        void navigate(`/?mode=friends&friends=${friend.userId}`)
                      }
                    >
                      비교
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `${friend.name}님을 친구에서 삭제할까요?`,
                          )
                        )
                          void run(
                            remove.mutateAsync(friend.userId),
                            "친구를 삭제했어요.",
                          );
                      }}
                    >
                      삭제
                    </button>
                  </div>
                );
              })}
            </div>
            {selected.length >= MAX_FRIEND_CALENDAR_SELECTION ? (
              <p className="field-hint" role="status">
                한 번에 최대 10명까지 비교할 수 있어요.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-body">
            아직 친구가 없어요. 이메일로 요청을 보내고 상대가 수락하면 일정
            비교를 시작할 수 있어요.
          </p>
        )}
      </Section>
    </div>
  );
}
