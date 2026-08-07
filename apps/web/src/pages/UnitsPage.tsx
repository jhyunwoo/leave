/**
 * 그룹 참여·생성 화면.
 *
 * 그룹 검색은 일부러 없다. 부대를 검색으로 찾을 수 있으면 그 자체가 부대 목록이
 * 되기 때문이다. 초대코드로만 들어올 수 있고, 새로 만들면 코드가 한 번 노출된다.
 */

import {
  unitCreateSchema,
  unitJoinSchema,
  type UnitCreateInput,
} from "@leave/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { IssuedUnitInvite, Me } from "@leave/client";
import { useCreateUnit, useJoinUnit, useLeaveUnit } from "@leave/client";
import { Field } from "../components/Field";
import { LeaveLimitFields } from "../components/LeaveLimitFields";
import { Modal } from "../components/Modal";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";

export function UnitsPage(props: { me: Me }) {
  const myUnit = props.me.unit;
  const isAdmin = myUnit != null && myUnit.adminId === props.me.user.id;
  const [inviteCode, setInviteCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [issuedInvite, setIssuedInvite] = useState<IssuedUnitInvite | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const join = useJoinUnit();
  const leaveUnit = useLeaveUnit();

  // 참여율을 함께 보여주지 않으면, 미가입자의 휴가가 빠진 수치를 실제 출타율로
  // 오해하게 된다. 기준 인원이 없으면 비율 자체를 주장하지 않는다.
  const participation =
    myUnit?.referenceMemberTotal && myUnit.referenceMemberTotal > 0
      ? Math.min(
          100,
          Math.round((myUnit.memberCount / myUnit.referenceMemberTotal) * 100),
        )
      : null;

  const doJoin = async () => {
    setError(null);
    const parsed = unitJoinSchema.safeParse({ code: inviteCode.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "초대코드를 확인해주세요");
      return;
    }
    try {
      await join.mutateAsync(parsed.data);
      setInviteCode("");
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "그룹에 참여하지 못했습니다",
      );
    }
  };

  const doLeave = async () => {
    setError(null);
    if (!myUnit) return;
    if (!confirm("이 그룹에서 나갈까요?")) return;
    try {
      await leaveUnit.mutateAsync();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "그룹을 나가지 못했어요. 관리자라면 먼저 다른 참여자에게 권한을 넘겨주세요.",
      );
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
        gap: "var(--sp-xl)",
      }}
    >
      <header>
        <h1 className="display-md">공유 그룹</h1>
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
          그룹은 검색되지 않습니다. 관리자에게 받은 초대코드로만 참여할 수
          있어요.
        </p>
      </header>

      <OfficialDisclaimer compact />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {myUnit ? (
        <div
          className="card-green"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--sp-lg)",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow" style={{ color: "var(--positive-deep)" }}>
              내 공유 그룹
            </p>
            <p className="display-xs" style={{ marginTop: 4 }}>
              {myUnit.name}
            </p>
            <p className="caption text-body" style={{ marginTop: 4 }}>
              참여율 {participation === null ? "미설정" : `${participation}%`}
              {participation !== null && participation < 70
                ? " · 실제 출타율은 더 높을 수 있어요"
                : ""}
            </p>
            <p
              className="caption"
              style={{ marginTop: 4, color: "var(--warning-content)" }}
            >
              그룹 이름에 실제 부대명·부대번호·주소·위치를 넣지 마세요.
            </p>
          </div>
          <div
            style={{ display: "flex", gap: "var(--sp-sm)", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/")}
            >
              달력 보기
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate("/units/manage")}
              >
                그룹 관리·초대
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={leaveUnit.isPending}
              onClick={() => void doLeave()}
            >
              그룹 나가기
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-lg)",
            }}
          >
            <h2 className="display-xs">초대코드로 참여</h2>
            <Field
              label="초대코드"
              hint="코드는 만료되거나 사용 횟수가 소진되면 사용할 수 없습니다."
            >
              <input
                className="input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="관리자에게 받은 긴 초대코드"
                aria-label="공유 그룹 초대코드"
                data-testid="unit-invite-code"
              />
            </Field>
            <button
              type="button"
              className="btn btn-primary"
              disabled={join.isPending}
              onClick={() => void doJoin()}
              data-testid="unit-join-submit"
            >
              {join.isPending ? "확인 중…" : "그룹 참여"}
            </button>
          </div>

          <div
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-lg)",
            }}
          >
            <h2 className="display-xs">관리자가 아직 없나요?</h2>
            <p className="body-sm text-body">
              식별 정보가 없는 공유 그룹을 만든 뒤, 한 번만 보이는 초대코드를
              직접 전달하세요.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateOpen(true)}
              data-testid="create-unit-open"
            >
              새 공유 그룹 만들기
            </button>
          </div>
        </>
      )}

      {issuedInvite && <InvitePanel invite={issuedInvite} />}

      {createOpen && (
        <CreateUnitModal
          onClose={() => setCreateOpen(false)}
          onCreated={(invite) => {
            setIssuedInvite(invite);
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** 원문 코드는 발급 응답에서만 한 번 돌아온다. 이 화면을 떠나면 다시 못 본다. */
function InvitePanel(props: { invite: IssuedUnitInvite }) {
  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--primary)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-md)",
      }}
    >
      <h2 className="display-xs">지금 초대코드를 보관하세요</h2>
      <p className="body-sm text-body">
        원문은 서버에 저장되지 않아 이 화면을 떠나면 다시 볼 수 없습니다.
      </p>
      <code
        aria-label="발급된 초대코드"
        style={{
          padding: "var(--sp-md)",
          borderRadius: "var(--r-md)",
          background: "var(--canvas-soft)",
          wordBreak: "break-all",
          fontWeight: 600,
        }}
      >
        {props.invite.code}
      </code>
      <p className="caption text-body">
        {new Date(props.invite.expiresAt).toLocaleString("ko-KR")}까지 · 최대{" "}
        {props.invite.maxUses}회
      </p>
    </div>
  );
}

function CreateUnitModal(props: {
  onClose: () => void;
  onCreated: (invite: IssuedUnitInvite) => void;
}) {
  const [name, setName] = useState("");
  const [referenceTotal, setReferenceTotal] = useState("");
  const [maxCount, setMaxCount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();

  const submit = async () => {
    const input = {
      name: name.trim(),
      referenceMemberTotal:
        referenceTotal.trim() === "" ? null : Number(referenceTotal),
      maxLeaveCount: maxCount.trim() === "" ? Number.NaN : Number(maxCount),
    } satisfies UnitCreateInput;
    const parsed = unitCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      const result = await create.mutateAsync(parsed.data);
      props.onCreated(result.invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "그룹을 만들지 못했습니다");
    }
  };

  return (
    <Modal title="새 공유 그룹" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
        }}
      >
        <p
          className="caption strong"
          style={{
            padding: "var(--sp-md)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--warning)",
            color: "var(--warning-content)",
          }}
        >
          실제 부대명·고유번호·주소·위치·병력 현황·작전/훈련 정보를 입력하지
          마세요. 이름은 서버 검색에 사용되지 않습니다.
        </p>
        <Field label="그룹 안에서만 보이는 별칭">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 여름 휴가방"
            maxLength={80}
            autoFocus
            data-testid="create-unit-name"
          />
        </Field>
        <Field
          label="계산 기준 인원 (선택)"
          hint="실제 편제·정원이 아닌 관리자가 정한 참고값입니다. 마지막 변경 시각이 함께 표시됩니다."
        >
          <input
            className="input"
            value={referenceTotal}
            onChange={(e) => setReferenceTotal(e.target.value)}
            inputMode="numeric"
            placeholder="예: 50"
            aria-label="계산 기준 인원"
            data-testid="create-unit-reference-total"
          />
        </Field>
        <LeaveLimitFields count={maxCount} onCountChange={setMaxCount} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={create.isPending}
          data-testid="create-unit-submit"
        >
          {create.isPending ? "만드는 중…" : "그룹 만들기"}
        </button>
      </form>
    </Modal>
  );
}
