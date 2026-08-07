/**
 * 프로필 화면 — 내 정보와 복무 진행률, 로그아웃·회원 탈퇴.
 */

import { Link, useNavigate } from "react-router";
import type { Me } from "@leave/client";
import { useDeleteAccount, useLogout } from "@leave/client";
import { Avatar } from "../components/Avatar";
import { LegalLinks } from "../components/LegalLinks";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";
import { fmtDateShort } from "@leave/shared";

export function ProfilePage(props: { me: Me }) {
  const { user, unit } = props.me;
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();

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

  const progress = Math.round(user.serviceProgress * 100);

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
          </div>
        </div>

        <div style={{ marginTop: "var(--sp-2xl)" }}>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="복무 진행률"
            style={{
              height: 10,
              borderRadius: "var(--r-pill)",
              background: "var(--hairline)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                borderRadius: "var(--r-pill)",
                background: "var(--primary)",
                transition: "width 240ms var(--ease-out)",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "var(--sp-sm)",
            }}
          >
            <span className="caption text-mute">복무 {progress}%</span>
            <span className="caption text-mute">
              {user.nextPromotionDate
                ? `다음 진급 ${fmtDateShort(user.nextPromotionDate)}`
                : "최종 계급"}
            </span>
          </div>
        </div>
      </section>

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
          onClick={() => navigate("/units")}
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

      {/* 계정 삭제 (앱스토어/플레이 정책상 계정 삭제 경로 제공) */}
      <button
        type="button"
        onClick={onDeleteAccount}
        disabled={deleteAccount.isPending}
        style={{
          alignSelf: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--negative-deep, #a72027)",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "underline",
          padding: "var(--sp-md)",
        }}
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
