/**
 * 프로필 화면 — 내 정보와 복무 진행률, 로그아웃·회원 탈퇴.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Me } from "@leave/client";
import {
  useDeleteAccount,
  useLogout,
  useMyDutyDays,
  useSetUsername,
} from "@leave/client";
import { formatUsername } from "@leave/shared";
import { Avatar } from "../components/Avatar";
import { UsernameField, useUsernameDraft } from "../components/UsernameField";
import { LegalLinks } from "../components/LegalLinks";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";
import { ServiceProgress } from "../components/ServiceProgress";
import { PasskeyManager } from "../components/PasskeyManager";
import { fmtDateShort } from "@leave/shared";

/**
 * 공개 사용자 이름 카드 — 지금 이름을 보여주고 그 자리에서 바꾼다.
 *
 * 이름을 바꿔도 사용자 id는 그대로라 친구 관계·휴가 소유권·로그인은 영향을 받지
 * 않는다. 바뀌는 것은 프로필 주소 하나뿐이고, 옛 주소는 그 순간 열리지 않는다.
 * 이전 이름을 예약해 두는 장치는 두지 않았다 — 아무도 못 쓰는 이름만 쌓인다.
 */
function UsernameCard(props: { username: string | null }) {
  const [editing, setEditing] = useState(false);
  const draft = useUsernameDraft(props.username ?? "");
  const setUsername = useSetUsername();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.valid) return;
    setError(null);
    try {
      await setUsername.mutateAsync({ username: draft.username });
      setSaved(draft.username);
      setEditing(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <section
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
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
        <div style={{ minWidth: 0 }}>
          <h2 className="display-xs">사용자 이름</h2>
          <p className="caption text-mute">
            {props.username
              ? formatUsername(props.username)
              : "아직 정하지 않았어요"}
          </p>
        </div>
        {editing ? null : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(true)}
            data-testid="profile-edit-username"
          >
            바꾸기
          </button>
        )}
      </div>
      <p className="caption text-body">
        친구가 나를 찾는 공개 이름이에요. 바꾸면 이전 프로필 주소는 더 이상
        열리지 않지만, 이미 맺은 친구 관계는 그대로 유지돼요.
      </p>
      {editing ? (
        <>
          <UsernameField
            draft={draft}
            serverError={error}
            autoFocus
            onSubmit={() => void submit()}
            testId="profile-username-input"
          />
          <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!draft.valid || setUsername.isPending}
              onClick={() => void submit()}
              data-testid="profile-save-username"
            >
              {setUsername.isPending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              className="btn btn-tertiary btn-sm"
              onClick={() => {
                setEditing(false);
                setError(null);
                draft.setRaw(props.username ?? "");
              }}
            >
              취소
            </button>
          </div>
        </>
      ) : null}
      {saved ? (
        <p className="field-hint" role="status">
          {formatUsername(saved)} 으로 바꿨어요.
        </p>
      ) : null}
      {props.username ? (
        <Link to={`/u/${props.username}`} className="btn btn-secondary btn-sm">
          내 공개 프로필 보기
        </Link>
      ) : null}
    </section>
  );
}

export function ProfilePage(props: { me: Me }) {
  const { user, unit } = props.me;
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const dutyDays = useMyDutyDays();

  const onDeleteAccount = () => {
    const ok = window.confirm(
      "계정과 등록한 휴가·알림·접속 기록이 영구히 삭제됩니다. 이 작업은 되돌릴 수 없어요. 정말 삭제할까요?",
    );
    if (!ok) return;
    void deleteAccount
      .mutateAsync()
      .then(() => navigate("/login"))
      .catch((err) =>
        window.alert(
          err instanceof Error ? err.message : "삭제하지 못했습니다",
        ),
      );
  };

  return (
    <div
      className="anim-rise"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "var(--sp-2xl) 0 var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-lg)",
      }}
    >
      <header style={{ padding: "var(--sp-lg) 0 var(--sp-sm)" }}>
        <p className="eyebrow">내 정보</p>
        <h1 className="display-md" style={{ marginTop: 6 }}>
          프로필
        </h1>
      </header>

      {/* 계급/전역 — DESIGN.md의 절제된 제품 UI 패널 */}
      <Link
        to="/service-progress"
        className="profile-service-progress-link"
        data-testid="profile-service-progress-card"
      >
        <section className="card-dark" style={{ padding: "var(--sp-2xl)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "var(--sp-lg)",
            }}
          >
            <div>
              <p className="eyebrow">현재 계급</p>
              <p className="display-md" style={{ marginTop: 6 }}>
                {user.rankLabel}
              </p>
              <p
                className="body-sm text-body"
                style={{ marginTop: "var(--sp-md)" }}
              >
                {user.branchLabel} · {user.name}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className="eyebrow">전역까지</p>
              <p className="display-md" style={{ marginTop: 6 }}>
                D-{user.daysUntilDischarge}
              </p>
              {/* 서버가 세는 값이라 D-day보다 한 박자 늦게 도착한다. 자리를
                  비워 두면 카드가 흔들리므로 도착하기 전에는 아예 그리지 않는다. */}
              {dutyDays.data ? (
                <p
                  className="body-sm text-body"
                  style={{ marginTop: "var(--sp-xs)" }}
                  data-testid="profile-duty-days"
                >
                  일과 {dutyDays.data.dutyDays}일
                </p>
              ) : null}
            </div>
          </div>

          <ServiceProgress
            enlistedAt={user.enlistedAt}
            dischargeAt={user.dischargeAt}
            caption={
              user.nextPromotionDate
                ? `다음 진급 ${fmtDateShort(user.nextPromotionDate)}`
                : "최종 계급"
            }
          />
          <div className="profile-service-progress-link__hint">
            <span>전체 화면으로 보기</span>
            <span aria-hidden="true">→</span>
          </div>
        </section>
      </Link>

      {/* 프로필 정보 */}
      <section
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "var(--sp-lg)" }}
        >
          <Avatar name={user.name} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="display-xs">{user.name}</p>
            {user.username ? (
              <p className="caption text-mute">
                {formatUsername(user.username)}
              </p>
            ) : null}
            <p className="caption text-mute">{user.email}</p>
          </div>
        </div>
        <p className="caption text-body">
          별칭만 표시합니다. 실명·군번·계급·기수·사진은 프로필에 저장하지
          마세요.
        </p>

        <dl style={{ margin: 0 }}>
          <InfoItem label="공유 그룹" value={unit?.name ?? "참여 전"} />
        </dl>
      </section>

      <UsernameCard username={user.username} />

      <PasskeyManager />

      <OfficialDisclaimer />

      {/* 휴가 총량·만기·정기외박 설정은 모두 보유 휴가 화면으로 옮겼다. */}
      <Link to="/leaves/grants" className="btn btn-secondary">
        보유 휴가
      </Link>

      <section
        className="card"
        style={{ display: "flex", gap: "var(--sp-md)", flexWrap: "wrap" }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => void navigate("/units")}
        >
          공유 그룹
        </button>
        <button
          type="button"
          className="btn btn-tertiary"
          style={{ flex: 1 }}
          disabled={logout.isPending}
          onClick={() => {
            void logout.mutateAsync().then(() => navigate("/login"));
          }}
        >
          로그아웃
        </button>
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-md)",
        }}
      >
        <h2 className="display-xs">개인정보와 계정</h2>
        <p className="body-sm text-body">
          앱을 삭제한 뒤에도 공개 삭제 요청 페이지에서 계정 삭제 방법을 확인할
          수 있어요. 여기서는 아래 버튼으로 바로 요청할 수 있습니다.
        </p>
        <LegalLinks />
      </section>

      {/* 계정 삭제 (앱스토어/플레이 정책상 계정 삭제 경로 제공).
          밑줄 친 글자였던 자리다 — 이 화면에서 유일하게 되돌릴 수 없는 동작인데
          버튼으로 보이지 않아 안내문의 일부로 읽혔다. 위험 변형을 쓰되 폭은
          글자에 맞춰, 눈에 걸리되 실수로 눌리지는 않게 둔다. */}
      <button
        type="button"
        className="btn btn-danger btn-sm"
        onClick={onDeleteAccount}
        disabled={deleteAccount.isPending}
        style={{ alignSelf: "center" }}
      >
        {deleteAccount.isPending ? "삭제 중…" : "계정 삭제"}
      </button>
    </div>
  );
}

function InfoItem(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="caption text-mute">{props.label}</dt>
      <dd className="body-sm strong" style={{ margin: "2px 0 0" }}>
        {props.value}
      </dd>
    </div>
  );
}
