import { unitUpdateSchema } from "@leave/shared";
import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { imageUrl } from "../api/client";
import type { Me } from "../api/queries";
import {
  useApproveJoinRequest,
  useJoinRequests,
  useRejectJoinRequest,
  useRemoveMember,
  useTransferAdmin,
  useUnitMembers,
  useUpdateUnit,
  useUploadUnitImage,
} from "../api/queries";
import { Avatar } from "../components/Avatar";
import { Field } from "../components/Field";

const RATIO_PRESETS = [
  { n: 1, d: 3 },
  { n: 1, d: 4 },
  { n: 1, d: 5 },
] as const;

export function UnitManagePage(props: { me: Me }) {
  const unit = props.me.unit;
  const navigate = useNavigate();
  const isAdmin = unit != null && unit.adminId === props.me.user.id;

  // 부대가 없거나 관리자가 아니면 접근 불가.
  if (!unit || !isAdmin) return <Navigate to="/units" replace />;

  return (
    <div
      className="anim-rise"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "var(--sp-lg) 0 var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-xl)",
      }}
    >
      <header>
        <button
          type="button"
          className="btn btn-tertiary btn-sm"
          onClick={() => navigate("/units")}
          style={{ marginBottom: "var(--sp-sm)" }}
        >
          ← 부대
        </button>
        <h1 className="display-md">부대 관리</h1>
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
          {unit.name} · 관리자만 이 화면을 볼 수 있어요.
        </p>
      </header>

      <EditUnitSection unit={unit} />
      <JoinRequestsSection unitId={unit.id} />
      <MembersSection me={props.me} unit={unit} />
    </div>
  );
}

/** 부대 정보 수정: 이미지·이름·소개·출타율·부대 인원. */
function EditUnitSection(props: { unit: NonNullable<Me["unit"]> }) {
  const { unit } = props;
  const update = useUpdateUnit(unit.id);
  const uploadImage = useUploadUnitImage(unit.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(unit.name);
  const [description, setDescription] = useState(unit.description ?? "");
  const [num, setNum] = useState(unit.maxLeaveNumerator);
  const [den, setDen] = useState(unit.maxLeaveDenominator);
  const [headcount, setHeadcount] = useState(
    unit.headcount != null ? String(unit.headcount) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const url = imageUrl(unit.imageKey);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      await uploadImage.mutateAsync(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 올리지 못했어요");
    }
  };

  const submit = async () => {
    setError(null);
    setSaved(false);
    const hc = headcount.trim();
    const input = {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      maxLeaveNumerator: num,
      maxLeaveDenominator: den,
      headcount: hc === "" ? null : Number(hc),
    };
    const parsed = unitUpdateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요");
    }
  };

  const basis = headcount.trim() ? Number(headcount) : unit.memberCount;
  const example = den > 0 ? Math.floor((basis * num) / den) : 0;

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <h2 className="display-xs">부대 정보</h2>

      <div style={{ display: "flex", gap: "var(--sp-lg)", alignItems: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            background: "var(--canvas-soft)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {url ? (
            <img
              src={url}
              alt={unit.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span className="caption text-mute">이미지</span>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickImage}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={uploadImage.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {uploadImage.isPending ? "올리는 중…" : "대표 이미지 바꾸기"}
          </button>
          <p className="caption text-mute" style={{ marginTop: 6 }}>
            정사각형 이미지를 권장해요.
          </p>
        </div>
      </div>

      <Field label="부대 이름">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="소개 (선택)">
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="부대를 알아볼 수 있는 한 줄"
        />
      </Field>

      <Field
        label="최대 출타율"
        hint={`부대 인원 ${basis}명 기준 하루 최대 ${example}명까지 출타할 수 있어요`}
      >
        <div style={{ display: "flex", gap: "var(--sp-sm)", alignItems: "center" }}>
          {RATIO_PRESETS.map((p) => (
            <button
              key={`${p.n}/${p.d}`}
              type="button"
              className={`btn btn-sm ${num === p.n && den === p.d ? "btn-primary" : "btn-secondary"}`}
              aria-pressed={num === p.n && den === p.d}
              onClick={() => {
                setNum(p.n);
                setDen(p.d);
              }}
            >
              {p.n}/{p.d}
            </button>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: "auto",
            }}
          >
            <input
              className="input"
              type="number"
              min={1}
              value={num}
              onChange={(e) => setNum(Number(e.target.value))}
              style={{ width: 64, textAlign: "center" }}
              aria-label="출타율 분자"
            />
            <span className="strong">/</span>
            <input
              className="input"
              type="number"
              min={1}
              value={den}
              onChange={(e) => setDen(Number(e.target.value))}
              style={{ width: 64, textAlign: "center" }}
              aria-label="출타율 분모"
            />
          </div>
        </div>
      </Field>

      <Field
        label="부대 인원 (선택)"
        hint="실제 부대 인원을 적으면 출타율이 이 값을 기준으로 계산돼요. 비워두면 앱 가입자 수를 사용해요."
      >
        <input
          className="input"
          type="number"
          min={1}
          value={headcount}
          onChange={(e) => setHeadcount(e.target.value)}
          placeholder={`가입자 ${unit.memberCount}명`}
          style={{ width: 160 }}
          aria-label="부대 인원"
        />
      </Field>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="caption" style={{ color: "var(--positive-deep)", fontWeight: 600 }}>
          저장했어요.
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={update.isPending}
        onClick={() => void submit()}
        style={{ alignSelf: "flex-start" }}
      >
        {update.isPending ? "저장 중…" : "변경사항 저장"}
      </button>
    </section>
  );
}

/** 가입 신청 목록: 승인/거절. */
function JoinRequestsSection(props: { unitId: string }) {
  const requests = useJoinRequests(props.unitId);
  const approve = useApproveJoinRequest(props.unitId);
  const reject = useRejectJoinRequest(props.unitId);
  const list = requests.data?.requests ?? [];

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-sm)" }}>
        <h2 className="display-xs">가입 신청</h2>
        {list.length > 0 && (
          <span className="badge badge-negative">{list.length}</span>
        )}
      </div>

      {requests.isPending ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "var(--sp-xl)" }}>
          <div className="spinner" aria-label="불러오는 중" />
        </div>
      ) : list.length === 0 ? (
        <div className="card-sage" style={{ textAlign: "center", padding: "var(--sp-xl)" }}>
          <p className="body-sm text-body">대기 중인 가입 신청이 없어요.</p>
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
          {list.map((r) => (
            <li
              key={r.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-md)",
              }}
            >
              <Avatar name={r.name} imageKey={r.profileImageKey} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="body-sm strong">
                  {r.rankLabel} {r.name}
                </p>
                <p className="caption text-mute">{r.branchLabel}</p>
              </div>
              <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={approve.isPending}
                  onClick={() => void approve.mutateAsync(r.userId)}
                >
                  승인
                </button>
                <button
                  type="button"
                  className="btn btn-tertiary btn-sm"
                  disabled={reject.isPending}
                  onClick={() => void reject.mutateAsync(r.userId)}
                >
                  거절
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 부대원 목록: 관리자 위임·내보내기. */
function MembersSection(props: {
  me: Me;
  unit: NonNullable<Me["unit"]>;
}) {
  const { me, unit } = props;
  const members = useUnitMembers(unit.id);
  const transfer = useTransferAdmin(unit.id);
  const remove = useRemoveMember(unit.id);
  const list = members.data?.members ?? [];

  const doTransfer = (userId: string, name: string) => {
    if (
      confirm(
        `${name}님에게 관리자를 넘길까요? 넘기고 나면 이 화면을 더 이상 볼 수 없어요.`,
      )
    ) {
      void transfer.mutateAsync({ userId });
    }
  };
  const doRemove = (userId: string, name: string) => {
    if (confirm(`${name}님을 부대에서 내보낼까요?`)) {
      void remove.mutateAsync(userId);
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-sm)" }}>
        <h2 className="display-xs">부대원</h2>
        <span className="caption text-mute">{list.length}명</span>
      </div>

      {members.isPending ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "var(--sp-xl)" }}>
          <div className="spinner" aria-label="불러오는 중" />
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
          {list.map((m) => {
            const isSelf = m.id === me.user.id;
            const isUnitAdmin = m.id === unit.adminId;
            return (
              <li
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-md)",
                }}
              >
                <Avatar name={m.name} imageKey={m.profileImageKey} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="body-sm strong">
                    {m.rankLabel} {m.name}
                    {isSelf && (
                      <span className="caption text-mute"> (나)</span>
                    )}
                  </p>
                  <p className="caption text-mute">{m.branchLabel}</p>
                </div>
                {isUnitAdmin ? (
                  <span className="badge badge-positive">관리자</span>
                ) : (
                  <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={transfer.isPending}
                      onClick={() => doTransfer(m.id, m.name)}
                    >
                      관리자 위임
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={remove.isPending}
                      onClick={() => doRemove(m.id, m.name)}
                    >
                      내보내기
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
