import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { API_URL, getAuthToken } from "../api/client";
import type { Me } from "../api/queries";
import { useDeleteAccount, useLogout } from "../api/queries";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "../components/Avatar";
import { fmtDateShort } from "../lib/format";

export function ProfilePage(props: { me: Me }) {
  const { user, unit } = props.me;
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`${API_URL}/images/profile`, {
        method: "PUT",
        headers: {
          "content-type": file.type,
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: file,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "업로드하지 못했습니다");
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
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
          <Avatar name={user.name} imageKey={user.profileImageKey} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="display-xs">{user.name}</p>
            <p className="caption text-mute">{user.email}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "올리는 중…" : "사진 변경"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPhoto(f);
            }}
          />
        </div>
        {uploadError && (
          <p className="field-error" role="alert">
            {uploadError}
          </p>
        )}

        <dl
          style={{
            margin: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--sp-lg)",
          }}
        >
          <InfoItem label="군 종류" value={user.branchLabel} />
          <InfoItem label="소속 부대" value={unit?.name ?? "미소속"} />
          <InfoItem label="입대일" value={user.enlistedAt} />
          <InfoItem label="전역 예정일" value={user.dischargeAt} />
        </dl>
      </section>

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
          부대 관리
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
