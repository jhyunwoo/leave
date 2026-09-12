/**
 * 친구 화면 — 사용자 이름 검색, 받은/보낸 요청, 친구 목록과 달력 비교.
 *
 * 예전에는 "정확한 가입 이메일"을 받아 요청을 보냈다. 그 방식은 요청 결과가 곧
 * "이 주소로 가입했는가"에 대한 답이라 친구 찾기가 이메일 열거 수단이 됐고,
 * 무엇보다 상대의 이메일을 이미 알고 있어야 했다. 지금은 공개 사용자 이름으로
 * 찾는다 — 애초에 공개하려고 만든 식별자다.
 */

import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  useIncomingFriendRequests,
  useOutgoingFriendRequests,
  useRemoveFriend,
  useUserSearch,
  type Me,
  type UserProfile,
} from "@leave/client";
import {
  formatUsername,
  isUsernameQuery,
  MAX_FRIEND_CALENDAR_SELECTION,
  normalizeUsernameQuery,
} from "@leave/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar } from "../components/Avatar";

function Section(props: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      className="card"
      style={{ padding: "var(--sp-xl)", display: "grid", gap: "var(--sp-md)" }}
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
        <h2 className="display-xs">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

/** 이름 + @아이디를 한 줄로. 표시 이름과 공개 이름을 눈으로 구분할 수 있게 둘 다 보여준다. */
function PersonLine(props: { name: string; username: string | null }) {
  return (
    <span style={{ display: "grid", minWidth: 0 }}>
      <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {props.name}
      </strong>
      {props.username ? (
        <span className="caption text-mute">
          {formatUsername(props.username)}
        </span>
      ) : null}
    </span>
  );
}

const RELATIONSHIP_LABEL: Record<UserProfile["relationship"], string> = {
  self: "나",
  none: "",
  outgoing: "요청함",
  incoming: "요청 받음",
  friends: "친구",
};

function SearchResults(props: { query: string }) {
  const search = useUserSearch(props.query);
  const normalized = normalizeUsernameQuery(props.query);

  if (!isUsernameQuery(normalized)) {
    return (
      <p className="field-hint">
        @아이디로 찾아보세요. 영문·한글·숫자와 마침표(.), 밑줄(_)을 쓸 수
        있어요.
      </p>
    );
  }
  if (search.isPending) {
    return <div className="spinner" role="status" aria-label="검색 중" />;
  }
  if (search.isError) {
    return (
      <p role="alert" className="field-error">
        검색하지 못했어요. 잠시 후 다시 시도해주세요.
      </p>
    );
  }
  if (!search.data?.results.length) {
    return (
      <p className="text-body" role="status">
        {formatUsername(normalized)} 와(과) 맞는 사용자가 없어요.
      </p>
    );
  }
  return (
    <ul
      style={{
        display: "grid",
        gap: "var(--sp-sm)",
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
      aria-label="검색 결과"
    >
      {search.data.results.map((result) => (
        <li key={result.userId}>
          <Link
            to={`/u/${result.username}`}
            className="friend-row"
            data-testid={`search-result-${result.username}`}
          >
            <Avatar name={result.name} size={36} />
            <PersonLine name={result.name} username={result.username} />
            <span className="caption text-mute" style={{ marginLeft: "auto" }}>
              {RELATIONSHIP_LABEL[result.relationship]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FriendsPage(props: { me: Me }) {
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const outgoing = useOutgoingFriendRequests();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const remove = useRemoveFriend();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const pending =
    accept.isPending ||
    decline.isPending ||
    cancel.isPending ||
    remove.isPending;

  // 타이핑 도중 글자마다 서버에 묻지 않는다. 규칙 판정은 즉시, 요청만 늦춘다.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

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
      {/* 제목 옆에 내 공개 프로필로 가는 길을 둔다. 앱의 친구 탭과 같은 자리·같은
          목적지다 — 프로필 메뉴는 내 계정 설정이고, 여기서 보고 싶은 것은 "친구에게
          이렇게 보인다" 쪽이다. 그 화면이 링크 공유까지 들고 있다. */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--sp-md)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="display-md">친구</h1>
          <p className="text-body" style={{ marginTop: "var(--sp-sm)" }}>
            서로 수락한 친구끼리 공유 상태의 휴가 날짜만 비교해요.
          </p>
        </div>
        {props.me.user.username ? (
          <Link
            to={`/u/${props.me.user.username}`}
            className="btn btn-secondary btn-sm"
            data-testid="friends-open-my-profile"
          >
            내 프로필
          </Link>
        ) : null}
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

      <Section title="사용자 이름으로 찾기">
        <div className="field">
          <label className="field-label" htmlFor="friend-search">
            사용자 이름 검색
          </label>
          <div className="username-input">
            <span className="username-input-at" aria-hidden="true">
              @
            </span>
            <input
              id="friend-search"
              className="input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="hyunwoo 또는 현우"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              data-testid="friend-search-input"
            />
          </div>
        </div>
        {query.trim() ? <SearchResults query={debouncedQuery} /> : null}
      </Section>

      {(incoming.data?.requests.length ?? 0) > 0 ? (
        <Section title="받은 요청">
          {incoming.data!.requests.map((request) => (
            <div key={request.userId} className="friend-row">
              <Link
                to={`/u/${request.username ?? ""}`}
                className="friend-row-main"
              >
                <Avatar name={request.name} size={36} />
                <PersonLine name={request.name} username={request.username} />
              </Link>
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
            <div key={request.userId} className="friend-row">
              <Link
                to={`/u/${request.username ?? ""}`}
                className="friend-row-main"
              >
                <Avatar name={request.name} size={36} />
                <PersonLine name={request.name} username={request.username} />
              </Link>
              <span className="caption text-mute">수락 대기</span>
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
          <div
            className="spinner"
            role="status"
            aria-label="친구 불러오는 중"
          />
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
                  <div key={friend.userId} className="friend-row">
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
                      to={`/u/${friend.username ?? ""}`}
                      className="friend-row-main"
                    >
                      <Avatar name={friend.name} size={36} />
                      <PersonLine
                        name={friend.name}
                        username={friend.username}
                      />
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
            아직 친구가 없어요. 위에서 @아이디로 찾아 요청을 보내고, 상대가
            수락하면 일정 비교를 시작할 수 있어요.
          </p>
        )}
      </Section>
    </div>
  );
}
