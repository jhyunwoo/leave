/**
 * 그룹 관리 화면(관리자 전용).
 * 기본 정보와 하루 최대 출타 인원, 제한 기간(검열·훈련), 구성원과 초대코드,
 * 관리자 이관까지 그룹 운영에 필요한 조작을 한 화면에 모은다.
 */

import {
  fmtDateTimeFull,
  blackoutCreateSchema,
  fmtRangeTiny,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  todayInSeoul,
  unitUpdateSchema,
  type UnitUpdateInput,
} from "@leave/shared";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { IssuedUnitInvite, Me } from "@leave/client";
import {
  useBlackouts,
  useBlockUser,
  useCreateBlackout,
  useCreateReport,
  useDeleteBlackout,
  useRemoveMember,
  useRotateUnitInvite,
  useTransferAdmin,
  useUnitMembers,
  useUpdateUnit,
} from "@leave/client";
import { Field } from "../components/Field";
import { InviteShare } from "../components/InviteShare";
import { LeaveLimitFields } from "../components/LeaveLimitFields";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";

type Unit = NonNullable<Me["unit"]>;

export function UnitManagePage(props: { me: Me }) {
  const unit = props.me.unit;
  const navigate = useNavigate();
  const isAdmin = unit != null && unit.adminId === props.me.user.id;

  // 그룹이 없거나 관리자가 아니면 접근 불가.
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
          onClick={() => void navigate("/units")}
          style={{ marginBottom: "var(--sp-sm)" }}
        >
          ← 공유 그룹
        </button>
        <h1 className="display-md">그룹 관리</h1>
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
          그룹 내부 별칭과 계산 참고값만 관리합니다. 실제 부대 정보는 입력하지
          마세요.
        </p>
      </header>

      <OfficialDisclaimer compact />
      <ParticipationSection unit={unit} />
      <EditUnitSection unit={unit} />
      <InviteSection unit={unit} />
      <BlackoutSection unit={unit} />
      <MembersSection me={props.me} unit={unit} />
      <ReportSection unit={unit} />
    </div>
  );
}

/**
 * 참여율을 숨기면 앱에 없는 사람의 휴가가 빠진 수치를 실제 출타율로 오해한다.
 * 참여율이 낮으면 숫자보다 경고를 먼저 보여준다.
 */
function ParticipationSection({ unit }: { unit: Unit }) {
  const reference = unit.referenceMemberTotal;
  const participation =
    reference && reference > 0
      ? Math.min(100, Math.round((unit.memberCount / reference) * 100))
      : null;
  const low = participation !== null && participation < 70;

  return (
    <section
      className={low ? "card" : "card-green"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-sm)",
        border: low ? "1px solid var(--negative)" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-sm)",
          flexWrap: "wrap",
        }}
      >
        <h2 className="display-xs">데이터 신뢰도</h2>
        <span className={`badge ${low ? "badge-negative" : "badge-positive"}`}>
          {participation === null ? "기준값 미설정" : `참여 ${participation}%`}
        </span>
      </div>
      <p className="body-sm text-body">
        {participation === null
          ? "계산 기준 인원을 설정해야 참여율을 보여줄 수 있습니다."
          : low
            ? "참여율이 70% 미만입니다. 앱에 없는 일정 때문에 실제 출타율은 더 높을 수 있습니다."
            : "참여율과 출타율 모두 관리자가 입력한 참고값이며 공식 기록이 아닙니다."}
      </p>
      {unit.lastTotalUpdatedAt && (
        <p className="caption text-mute">
          기준 인원 마지막 갱신: {fmtDateTimeFull(unit.lastTotalUpdatedAt)}
        </p>
      )}
    </section>
  );
}

function EditUnitSection({ unit }: { unit: Unit }) {
  const update = useUpdateUnit(unit.id);
  const [name, setName] = useState(unit.name);
  const [referenceTotal, setReferenceTotal] = useState(
    unit.referenceMemberTotal == null ? "" : String(unit.referenceMemberTotal),
  );
  const [maxCount, setMaxCount] = useState(String(unit.maxLeaveCount));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    setError(null);
    setSaved(false);
    const input = {
      name: name.trim(),
      description: null,
      referenceMemberTotal:
        referenceTotal.trim() === "" ? null : Number(referenceTotal),
      maxLeaveCount: maxCount.trim() === "" ? Number.NaN : Number(maxCount),
    } satisfies UnitUpdateInput;
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

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <h2 className="display-xs">그룹 설정</h2>

      <Field
        label="그룹 안에서만 보이는 별칭"
        hint="검색·색인되지 않습니다. 실제 부대명이나 고유번호를 쓰지 마세요."
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </Field>

      <Field
        label="계산 기준 인원 (선택)"
        hint="실제 편제·정원이 아닌 임의의 참고값입니다."
      >
        <input
          className="input"
          value={referenceTotal}
          onChange={(e) => setReferenceTotal(e.target.value)}
          inputMode="numeric"
          aria-label="계산 기준 인원"
        />
      </Field>

      <LeaveLimitFields count={maxCount} onCountChange={setMaxCount} />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p
          className="caption"
          style={{ color: "var(--positive-deep)", fontWeight: 600 }}
        >
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

function InviteSection({ unit }: { unit: Unit }) {
  const rotate = useRotateUnitInvite(unit.id);
  const [invite, setInvite] = useState<IssuedUnitInvite | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issue = async () => {
    setError(null);
    if (
      !confirm(
        "기존 초대코드는 즉시 폐기됩니다. 새 코드는 이 화면에서 한 번만 확인할 수 있어요. 계속할까요?",
      )
    ) {
      return;
    }
    try {
      const result = await rotate.mutateAsync({});
      setInvite(result.invite);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "초대코드를 발급하지 못했어요.",
      );
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <h2 className="display-xs">초대코드</h2>
      <p className="body-sm text-body">
        그룹은 검색할 수 없습니다. 만료·횟수 제한이 있는 코드를 필요한
        사람에게만 전달하세요.
      </p>

      {invite && <InviteShare invite={invite} />}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        disabled={rotate.isPending}
        onClick={() => void issue()}
        style={{ alignSelf: "flex-start" }}
      >
        {rotate.isPending ? "발급 중…" : "새 코드 발급·기존 코드 폐기"}
      </button>
    </section>
  );
}

function MembersSection(props: { me: Me; unit: Unit }) {
  const { me, unit } = props;
  const members = useUnitMembers(unit.id);
  const transfer = useTransferAdmin(unit.id);
  const remove = useRemoveMember(unit.id);
  const block = useBlockUser();
  const report = useCreateReport();
  const list = members.data?.members ?? [];

  const doTransfer = (userId: string, alias: string) => {
    if (
      confirm(
        `${alias}님에게 관리자를 넘길까요? 넘긴 뒤에는 이 화면을 볼 수 없습니다.`,
      )
    ) {
      void transfer.mutateAsync({ userId });
    }
  };
  const doRemove = (userId: string, alias: string) => {
    if (confirm(`${alias}님을 그룹에서 내보낼까요?`)) {
      void remove.mutateAsync(userId);
    }
  };
  /** 차단은 이 목록에서만 숨긴다. 출타 집계는 그대로라 숫자가 흔들리지 않는다. */
  const doBlock = (userId: string, alias: string) => {
    if (
      confirm(
        `${alias}님을 차단할까요? 참여자 목록에서 보이지 않게 되며, 출타 집계에는 그대로 반영됩니다.`,
      )
    ) {
      void block.mutateAsync({ userId });
    }
  };
  const doReport = (userId: string, alias: string) => {
    if (confirm(`${alias}님의 별칭을 신고할까요? 24시간 안에 검토합니다.`)) {
      void report.mutateAsync({
        targetType: "member",
        targetId: userId,
        reason: "personal_info",
      });
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: "var(--sp-sm)" }}
      >
        <h2 className="display-xs">참여자</h2>
        <span className="caption text-mute">{list.length}명</span>
      </div>
      <p className="body-sm text-body">
        별칭만 표시합니다. 실명·계급·군번은 입력하거나 요구하지 마세요.
      </p>

      {members.isPending ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "var(--sp-xl)",
          }}
        >
          <div className="spinner" role="status" aria-label="불러오는 중" />
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
                  minHeight: 44,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "var(--canvas-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <p className="body-sm strong" style={{ flex: 1, minWidth: 0 }}>
                  {m.name}
                  {isSelf && <span className="caption text-mute"> (나)</span>}
                </p>
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
                      className="btn btn-tertiary btn-sm"
                      disabled={report.isPending}
                      onClick={() => doReport(m.id, m.name)}
                    >
                      신고
                    </button>
                    <button
                      type="button"
                      className="btn btn-tertiary btn-sm"
                      disabled={block.isPending}
                      onClick={() => doBlock(m.id, m.name)}
                    >
                      차단
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

/**
 * 검열·훈련처럼 출타율과 무관하게 휴가가 제한될 수 있는 기간.
 * 이게 없으면 앱은 "가능"이라 했는데 현실은 불가인 상황이 반복된다.
 */
function BlackoutSection({ unit }: { unit: Unit }) {
  const list = useBlackouts(unit.id);
  const create = useCreateBlackout(unit.id);
  const remove = useDeleteBlackout(unit.id);
  const [startDate, setStartDate] = useState(todayInSeoul());
  const [endDate, setEndDate] = useState(todayInSeoul());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const parsed = blackoutCreateSchema.safeParse({
      startDate,
      endDate,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록하지 못했어요");
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <h2 className="display-xs">제한 기간</h2>
      <p className="body-sm text-body">
        검열·훈련·평가처럼 출타율과 무관하게 휴가가 제한될 수 있는 기간을
        등록하면, 참여자 달력에 "제한 가능"으로 표시됩니다.
      </p>

      <div className="field-pair">
        <Field label="시작일">
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => {
              const next = e.target.value;
              setStartDate(next);
              if (endDate < next) setEndDate(next);
            }}
          />
        </Field>
        <Field label="종료일">
          <input
            className="input"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label="사유 (선택)" hint="작전·훈련 세부 내용은 적지 마세요.">
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 정기 검열"
          maxLength={200}
        />
      </Field>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={create.isPending}
        onClick={() => void submit()}
        style={{ alignSelf: "flex-start" }}
      >
        {create.isPending ? "등록 중…" : "제한 기간 등록"}
      </button>

      {list.data && list.data.blackouts.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-sm)",
          }}
        >
          {list.data.blackouts.map((b) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-md)",
                minHeight: 44,
              }}
            >
              <span className="body-sm strong" style={{ flex: 1, minWidth: 0 }}>
                {fmtRangeTiny(b.startDate, b.endDate)}
                {b.reason ? (
                  <span className="caption text-mute"> · {b.reason}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn-tertiary btn-sm"
                disabled={remove.isPending}
                onClick={() => void remove.mutateAsync(b.id)}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** UGC 신고 경로 (Apple 1.2 / Google Play UGC 정책). */
function ReportSection({ unit }: { unit: Unit }) {
  const report = useCreateReport();
  const [reason, setReason] =
    useState<(typeof REPORT_REASONS)[number]>("military_info");
  const [detail, setDetail] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    setResult(null);
    try {
      await report.mutateAsync({
        targetType: "unit",
        targetId: unit.id,
        reason,
        ...(detail.trim() ? { detail: detail.trim() } : {}),
      });
      setDetail("");
      setResult("접수했어요. 24시간 안에 검토합니다.");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "접수하지 못했어요");
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}
    >
      <h2 className="display-xs">그룹 이름·설명 신고</h2>
      <p className="body-sm text-body">
        그룹 이름이나 설명에 실제 부대 정보·개인정보가 들어 있으면 신고해주세요.
      </p>
      <Field label="사유">
        <select
          className="input"
          value={reason}
          onChange={(e) =>
            setReason(e.target.value as (typeof REPORT_REASONS)[number])
          }
        >
          {REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {REPORT_REASON_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="자세한 내용 (선택)">
        <input
          className="input"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={500}
        />
      </Field>
      {result && (
        <p className="caption text-body" role="status">
          {result}
        </p>
      )}
      <button
        type="button"
        className="btn btn-tertiary"
        disabled={report.isPending}
        onClick={() => void submit()}
        style={{ alignSelf: "flex-start" }}
      >
        {report.isPending ? "접수 중…" : "신고하기"}
      </button>
    </section>
  );
}
