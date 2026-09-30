/**
 * 친구가 공유한 상태 — 전역·다음 휴가 D-day와 복무율.
 *
 * 사용처: 친구 목록 카드(`FriendsPage`), 친구 프로필(`UserProfilePage`).
 * 두 화면이 같은 친구를 같은 말로 보여줘야 해서 한곳에 둔다. 문구와
 * 비공개·없음의 구분은 `@leave/client`의 friend-countdown이 정한다 — 앱의
 * 친구 탭·프로필과도 같은 말을 한다.
 */

import "./friend-shared-status.css";

import {
  friendDischargeDday,
  friendNextLeaveDday,
  type Friend,
} from "@leave/client";
import { todayInSeoul } from "@leave/shared";
import { ServiceProgress } from "./ServiceProgress";
import { SERVICE_PERCENT_DECIMALS } from "./service-progress-format";

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
            className={
              item.muted
                ? "friend-dday-value friend-dday-muted"
                : "friend-dday-value"
            }
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
export function FriendSharedStatus(props: { friend: Friend }) {
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
            // 동작 줄이기에서도 열 자리로 둔다. 생략하면 그때만 한 자리로 떨어진다.
            decimals={SERVICE_PERCENT_DECIMALS}
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
