/**
 * 알림함 화면. 열면 전부 읽음 처리되고, 초과 알림은 해당 휴가 상세로 이어진다.
 */

import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  useDeleteNotification,
  useMarkNotificationsRead,
  useMyLeaves,
  useNotifications,
  type NotificationList,
} from "@leave/client";
import { fmtDateTimeShort, fmtDateShort } from "@leave/shared";

type Notification = NotificationList["notifications"][number];

export function NotificationsPage() {
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const del = useDeleteNotification();
  const myLeaves = useMyLeaves();
  const navigate = useNavigate();

  /**
   * 초과일 중 내 휴가가 걸린 첫 날짜와 그 휴가를 찾는다.
   *
   * 알림의 leaveId는 초과를 유발한 "남의" 휴가라 이동에 쓸 수 없다. 알림을 받은
   * 사람은 정의상 초과일에 자기 휴가가 있으므로 여기서 되짚을 수 있다 —
   * 다만 알림을 받은 뒤 그 휴가를 지웠거나 기간을 바꿨으면 못 찾을 수 있다.
   */
  const resolveTarget = (dates: string[]) => {
    for (const date of [...dates].sort()) {
      const mine = myLeaves.data?.leaves.find(
        (leave) => leave.startDate <= date && date <= leave.endDate,
      );
      if (mine) return { leaveId: mine.id, date };
    }
    return null;
  };

  const openDates = (dates: string[]) => {
    const target = resolveTarget(dates);
    if (!target) {
      alert(
        "휴가를 찾을 수 없어요. 이미 삭제하거나 기간을 바꾼 계획일 수 있어요.",
      );
      return;
    }
    void navigate(`/leaves/${target.leaveId}?date=${target.date}`);
  };

  /**
   * 알림 한 건을 지운다. 확인을 묻지 않는다 — 메일함처럼, 알림은 지워도 잃는 것이
   * 없고 되짚을 휴가는 캘린더에 그대로 남는다.
   */
  const remove = (notification: Notification) => {
    void del.mutateAsync(notification.id).catch(() => {
      alert("삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
    });
  };

  /** 카드·행 전체가 클릭 대상이라 삭제 클릭이 그 위로 새지 않게 막는다. */
  const renderDelete = (notification: Notification) => (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      aria-label={`${notification.title} 알림 삭제`}
      disabled={del.isPending}
      onClick={(e) => {
        e.stopPropagation();
        remove(notification);
      }}
    >
      삭제
    </button>
  );

  // 카드·행 전체가 클릭 대상이라 키보드로도 같은 동작이 되게 한다.
  const onCardKeyDown = (dates: string[]) => (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    openDates(dates);
  };

  /** 날짜 배지 줄. 배지 하나하나가 그 날짜의 상세로 가는 입구다. */
  const renderDates = (notification: Notification) =>
    notification.dates.length > 0 ? (
      <div
        style={{
          display: "flex",
          gap: "var(--sp-xs)",
          flexWrap: "wrap",
          marginTop: "var(--sp-sm)",
        }}
      >
        {notification.dates.map((d) => (
          <button
            key={d}
            type="button"
            className="badge badge-negative caption"
            aria-label={`${fmtDateShort(d)} 휴가 상세 보기`}
            onClick={(e) => {
              // 행 전체 클릭과 겹치지 않게 배지 클릭을 따로 처리한다.
              e.stopPropagation();
              openDates([d]);
            }}
            style={{ cursor: "pointer", border: "1px solid var(--negative)" }}
          >
            {fmtDateShort(d)}
          </button>
        ))}
      </div>
    ) : null;

  const notifications = list.data?.notifications ?? [];
  const [latest, ...earlier] = notifications;

  return (
    <div
      className="anim-rise"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "var(--sp-lg) 0 var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-xl)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "var(--sp-lg)",
        }}
      >
        <div>
          <h1 className="display-md">알림</h1>
          <p
            className="body-lg text-body"
            style={{ marginTop: "var(--sp-sm)" }}
          >
            최대 출타 인원 초과 소식을 여기서 확인해요.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-sm)", flexShrink: 0 }}>
          {list.data && list.data.unreadCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={markRead.isPending}
              onClick={() => void markRead.mutateAsync()}
            >
              모두 읽음
            </button>
          )}
          <Link
            to="/notifications/settings"
            className="btn btn-secondary btn-sm"
          >
            알림 설정
          </Link>
        </div>
      </header>

      {list.isPending ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "var(--sp-3xl)",
          }}
        >
          <div className="spinner" aria-label="불러오는 중" />
        </div>
      ) : !latest ? (
        <div
          className="card-sage"
          style={{ textAlign: "center", padding: "var(--sp-3xl)" }}
        >
          <p className="body-lg strong">아직 알림이 없어요</p>
          <p
            className="body-sm text-body"
            style={{ marginTop: "var(--sp-sm)" }}
          >
            내 휴가 기간에 최대 출타 인원이 초과되면 알려드릴게요.
          </p>
        </div>
      ) : (
        <>
          {/* 최근 알림은 목록에서 떼어내 가장 먼저, 가장 크게 보여준다. */}
          <section
            className="card"
            data-testid="latest-notification"
            role="button"
            tabIndex={0}
            aria-label={`최근 알림: ${latest.title}. 휴가 상세 보기`}
            onClick={() => openDates(latest.dates)}
            onKeyDown={onCardKeyDown(latest.dates)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-sm)",
              cursor: "pointer",
              borderLeft: latest.read
                ? "4px solid var(--canvas-soft)"
                : "4px solid var(--negative)",
            }}
          >
            <p className="eyebrow">최근 알림</p>
            <p className="display-xs">{latest.title}</p>
            <p className="body-sm text-body">{latest.body}</p>
            {renderDates(latest)}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--sp-sm)",
                marginTop: "var(--sp-sm)",
              }}
            >
              <span className="caption text-mute">
                {fmtDateTimeShort(latest.createdAt)}
              </span>
              <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                {renderDelete(latest)}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDates(latest.dates);
                  }}
                >
                  자세히
                </button>
              </div>
            </div>
          </section>

          {earlier.length > 0 && (
            <section
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--sp-sm)",
              }}
            >
              <h2 className="caption text-mute">이전 알림</h2>
              <ul
                className="content-panel"
                style={{ listStyle: "none", margin: 0, padding: 0 }}
              >
                {earlier.map((n) => (
                  <li
                    key={n.id}
                    className="content-row"
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.title}. 휴가 상세 보기`}
                    onClick={() => openDates(n.dates)}
                    onKeyDown={onCardKeyDown(n.dates)}
                    style={{
                      display: "flex",
                      gap: "var(--sp-md)",
                      opacity: n.read ? 0.65 : 1,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        marginTop: 6,
                        flexShrink: 0,
                        background: n.read
                          ? "var(--canvas-soft)"
                          : "var(--negative)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="body-sm strong">{n.title}</p>
                      <p className="body-sm text-body" style={{ marginTop: 2 }}>
                        {n.body}
                      </p>
                      {renderDates(n)}
                      <p
                        className="caption text-mute"
                        style={{ marginTop: "var(--sp-sm)" }}
                      >
                        {fmtDateTimeShort(n.createdAt)}
                      </p>
                    </div>
                    <div style={{ flexShrink: 0 }}>{renderDelete(n)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
