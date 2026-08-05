import {
  useMarkNotificationsRead,
  useNotificationPrefs,
  useNotifications,
  useUpdateNotificationPrefs,
} from "../api/queries";
import { fmtDateShort } from "../lib/format";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function NotificationsPage() {
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const prefs = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();

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

      {/* 종류별 on/off — 전부 꺼도 앱은 그대로 쓸 수 있다. */}
      <section
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-md)",
        }}
      >
        <h2 className="display-xs">받을 알림 고르기</h2>
        <p className="body-sm text-body">
          종류별로 따로 끌 수 있어요. 모두 꺼도 캘린더와 계획 기능은 그대로
          사용할 수 있습니다.
        </p>
        <PrefToggle
          checked={prefs.data?.preferences.overage ?? true}
          onChange={(overage) => void updatePrefs.mutateAsync({ overage })}
          testId="notification-pref-overage"
          label="내 계획 날짜가 참고 기준을 넘겼을 때"
        />
        <PrefToggle
          checked={prefs.data?.preferences.blackout ?? true}
          onChange={(blackout) => void updatePrefs.mutateAsync({ blackout })}
          testId="notification-pref-blackout"
          label="내 계획 기간에 제한 기간(검열·훈련)이 등록됐을 때"
        />
        <PrefToggle
          checked={prefs.data?.preferences.unitNotice ?? true}
          onChange={(unitNotice) => void updatePrefs.mutateAsync({ unitNotice })}
          testId="notification-pref-unit-notice"
          label="그룹 설정·관리자 변경 안내"
        />
      </section>

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
          className="content-panel"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {list.data.notifications.map((n) => (
            <li
              key={n.id}
              className="content-row"
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

function PrefToggle(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  testId: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "var(--sp-sm)",
        alignItems: "center",
        cursor: "pointer",
        minHeight: 44,
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        style={{ width: 20, height: 20, flexShrink: 0 }}
        data-testid={props.testId}
      />
      <span className="body-sm text-body">{props.label}</span>
    </label>
  );
}
