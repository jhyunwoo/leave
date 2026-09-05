/** 알림 수신 설정 화면(초과 알림 등 종류별 on/off). */

import { Link } from "react-router";
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from "@leave/client";

export function NotificationSettingsPage() {
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
      <header>
        <Link to="/notifications" className="caption text-mute">
          ‹ 알림
        </Link>
        <h1 className="display-md" style={{ marginTop: "var(--sp-sm)" }}>
          알림 설정
        </h1>
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
          어떤 알림을 받을지 여기서 정해요.
        </p>
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
          onChange={(unitNotice) =>
            void updatePrefs.mutateAsync({ unitNotice })
          }
          testId="notification-pref-unit-notice"
          label="그룹 설정·관리자 변경 안내"
        />
        <PrefToggle
          checked={prefs.data?.preferences.friendRequest ?? true}
          onChange={(friendRequest) =>
            void updatePrefs.mutateAsync({ friendRequest })
          }
          testId="notification-pref-friend-request"
          label="새 친구 요청이 왔을 때"
        />
        <PrefToggle
          checked={prefs.data?.preferences.friendLeave ?? true}
          onChange={(friendLeave) =>
            void updatePrefs.mutateAsync({ friendLeave })
          }
          testId="notification-pref-friend-leave"
          label="친구가 새 휴가를 등록했을 때"
        />
      </section>

      <p className="caption text-mute">
        기기 잠금화면 알림은 모바일 앱에서 직접 켤 수 있어요.
      </p>
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
