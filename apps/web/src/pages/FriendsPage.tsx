/**
 * 친구 화면 — 사용자 이름 검색, 받은/보낸 요청, 친구 목록과 달력 비교.
 *
 * 예전에는 "정확한 가입 이메일"을 받아 요청을 보냈다. 그 방식은 요청 결과가 곧
 * "이 주소로 가입했는가"에 대한 답이라 친구 찾기가 이메일 열거 수단이 됐고,
 * 무엇보다 상대의 이메일을 이미 알고 있어야 했다. 지금은 공개 사용자 이름으로
 * 찾는다 — 애초에 공개하려고 만든 식별자다.
 */

import "./workspace.css";

import { ActionIcon } from "../components/ActionIcon";

import {
  friendDischargeDday,
  friendNextLeaveDday,
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  useFriendSharing,
  useIncomingFriendRequests,
  useOutgoingFriendRequests,
  useUpdateFriendSharing,
  useUserSearch,
  type Friend,
  type Me,
  type UserProfile,
} from "@leave/client";
import {
  formatUsername,
  isUsernameQuery,
  MAX_FRIEND_CALENDAR_SELECTION,
  normalizeUsernameQuery,
  todayInSeoul,
  type FriendSharingInput,
} from "@leave/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ServiceProgress } from "../components/ServiceProgress";
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

/**
 * 내가 친구에게 보여주는 항목 — 모든 친구에게 같게 적용된다.
 *
 * 설정을 받기 전에는 체크박스를 잠근다. 기본값인 "켜짐"을 먼저 그렸다가 실제 값으로
 * 바꾸면, 공유를 끈 사람에게 잠깐이라도 "공유 중"이라고 말하게 된다.
 */
function SharingSection() {
  const sharing = useFriendSharing();
  const update = useUpdateFriendSharing();
  const current = sharing.data?.sharing;
  const change = (input: FriendSharingInput) => update.mutate(input);

  return (
    <Section title="내가 공유하는 항목">
      <p className="caption text-body">
        모든 친구에게 똑같이 적용돼요. 끈 항목은 친구 화면에 “비공개”로 보여요.
      </p>
      <SharingToggle
        label="복무율 (입대일·전역일)"
        checked={current?.serviceProgress}
        onChange={(serviceProgress) => change({ serviceProgress })}
        testId="friend-sharing-service-progress"
      />
      <SharingToggle
        label="남은 일과일"
        hint="휴가로 빠지는 날이 반영된 숫자예요."
        checked={current?.dutyDays}
        onChange={(dutyDays) => change({ dutyDays })}
        testId="friend-sharing-duty-days"
      />
      <SharingToggle
        label="휴가 일정 (외출 포함)"
        hint="끄면 친구 달력과 새 휴가 알림에서도 빠져요."
        checked={current?.leaveSchedule}
        onChange={(leaveSchedule) => change({ leaveSchedule })}
        testId="friend-sharing-leave-schedule"
      />
      {sharing.isError ? (
        <p role="alert" className="field-error">
          공유 설정을 불러오지 못했어요.
        </p>
      ) : null}
      {update.isError ? (
        <p role="alert" className="field-error">
          저장하지 못했어요. 잠시 후 다시 시도해주세요.
        </p>
      ) : null}
    </Section>
  );
}

function SharingToggle(props: {
  label: string;
  hint?: string;
  /** 아직 받지 못했으면 undefined — 그동안은 잠가 둔다. */
  checked: boolean | undefined;
  onChange: (next: boolean) => void;
  testId: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "var(--sp-sm)",
        alignItems: "flex-start",
        cursor: "pointer",
        minHeight: 44,
      }}
    >
      <input
        type="checkbox"
        checked={props.checked ?? false}
        disabled={props.checked === undefined}
        onChange={(event) => props.onChange(event.target.checked)}
        style={{ width: 20, height: 20, flexShrink: 0 }}
        data-testid={props.testId}
      />
      <span style={{ display: "grid", gap: 2 }}>
        <span className="body-sm text-body">{props.label}</span>
        {props.hint ? (
          <span className="caption text-mute">{props.hint}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * 전역·다음 휴가 D-day 두 칸. 문구와 비공개·없음의 구분은 `@leave/client`가
 * 정한다 — 앱의 친구 탭과 같은 말을 해야 한다.
 */
function FriendDdays(props: { friend: Friend }) {
  const { friend } = props;
  const today = todayInSeoul();
  const items = [
    ["discharge", friendDischargeDday(friend, today)],
    ["leave", friendNextLeaveDday(friend, today)],
  ] as const;
  return (
    <div className="friend-ddays">
      {items.map(([key, item]) => (
        <div
          key={key}
          className="friend-dday"
          data-testid={`friend-dday-${key}`}
        >
          {/* "D-12"를 그대로 읽으면 뜻이 사라진다. 스크린리더에는 문장을 준다. */}
          <span className="caption text-mute" aria-hidden="true">
            {item.label}
          </span>
          <strong
            className={item.muted ? "friend-dday-muted" : undefined}
            aria-hidden="true"
          >
            {item.value}
          </strong>
          <span className="visually-hidden">{item.spoken}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 친구가 공유한 만큼만 그린다. null은 "없음"이 아니라 공유하지 않은 것이다 —
 * 빈 자리로 두면 "휴가가 없다"거나 "셀 날이 없다"로 읽힌다.
 */
function FriendSharedStatus(props: { friend: Friend }) {
  const { friend } = props;
  const dutyDays =
    friend.dutyDays === null
      ? "남은 일과일 비공개"
      : `남은 일과일 ${friend.dutyDays}일`;
  return (
    <div
      style={{
        flexBasis: "100%",
        minWidth: 0,
        display: "grid",
        gap: "var(--sp-sm)",
      }}
    >
      <FriendDdays friend={friend} />
      {friend.enlistedAt !== null && friend.dischargeAt !== null ? (
        <div data-testid="friend-service-progress">
          <ServiceProgress
            enlistedAt={friend.enlistedAt}
            dischargeAt={friend.dischargeAt}
            decimals={5}
            compact
            caption={dutyDays}
          />
        </div>
      ) : (
        <p className="caption text-mute">복무율 비공개 · {dutyDays}</p>
      )}
    </div>
  );
}

export function FriendsPage(props: { me: Me }) {
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const outgoing = useOutgoingFriendRequests();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const pending = accept.isPending || decline.isPending || cancel.isPending;

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
      className="anim-rise workspace-page friends-page"
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

      <div className="workspace-columns friends-workspace">
        <aside
          className="workspace-stack"
          aria-label="친구 찾기와 요청, 공유 설정"
        >
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
                    <PersonLine
                      name={request.name}
                      username={request.username}
                    />
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
                      <ActionIcon name="check" />
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
                      <ActionIcon name="close" />
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
                    <PersonLine
                      name={request.name}
                      username={request.username}
                    />
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

          <SharingSection />
        </aside>
        <Section
          title={`내 친구${friends.data ? ` ${friends.data.friends.length}명` : ""}`}
        >
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
                    void navigate(
                      `/?mode=friends&friends=${selected.join(",")}`,
                    )
                  }
                >
                  <ActionIcon name="calendar" />
                  선택한 친구와 달력 보기
                </button>
              </div>
              <div style={{ display: "grid", gap: "var(--sp-sm)" }}>
                {friends.data.friends.map((friend) => {
                  const checked = selected.includes(friend.userId);
                  const limitReached =
                    selected.length >= MAX_FRIEND_CALENDAR_SELECTION &&
                    !checked;
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
                          void navigate(
                            `/?mode=friends&friends=${friend.userId}`,
                          )
                        }
                      >
                        <ActionIcon name="calendar" />
                        비교
                      </button>
                      <FriendSharedStatus friend={friend} />
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
              아직 친구가 없어요. @아이디로 찾아 요청을 보내고, 상대가 수락하면
              일정 비교를 시작할 수 있어요.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
