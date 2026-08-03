import { useMarkNotificationsRead, useNotifications } from "../api/queries";
import { fmtDateShort } from "../lib/format";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function NotificationsPage() {
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();

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
      ) : !list.data || list.data.notifications.length === 0 ? (
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
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-md)",
          }}
        >
          {list.data.notifications.map((n) => (
            <li
              key={n.id}
              className="card"
              style={{
                display: "flex",
                gap: "var(--sp-md)",
                opacity: n.read ? 0.65 : 1,
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
                  background: n.read ? "var(--canvas-soft)" : "var(--negative)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <p className="body-sm strong">{n.title}</p>
                <p className="body-sm text-body" style={{ marginTop: 2 }}>
                  {n.body}
                </p>
                {n.dates.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--sp-xs)",
                      flexWrap: "wrap",
                      marginTop: "var(--sp-sm)",
                    }}
                  >
                    {n.dates.map((d) => (
                      <span key={d} className="badge badge-negative caption">
                        {fmtDateShort(d)}
                      </span>
                    ))}
                  </div>
                )}
                <p
                  className="caption text-mute"
                  style={{ marginTop: "var(--sp-sm)" }}
                >
                  {fmtTime(n.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
