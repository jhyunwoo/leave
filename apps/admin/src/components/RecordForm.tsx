import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  draftsToSegments,
  fitDrafts,
  removeDraft,
  resolveDrafts,
  segmentsToDrafts,
  setDraftEnd,
  splitLastDraft,
  type BalanceKey,
  type LeaveSegment,
  type SegmentDraft,
} from "@leave/shared";
import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

export type EditableResource =
  | "users"
  | "units"
  | "leaves"
  | "notifications"
  | "admins";

type Props = {
  resource: EditableResource;
  mode: "create" | "edit";
  initial?: Record<string, unknown>;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
};

const stringValue = (
  initial: Record<string, unknown> | undefined,
  key: string,
): string => {
  const value = initial?.[key];
  return value === null || value === undefined ? "" : String(value);
};

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function nullable(form: FormData, key: string): string | null {
  return value(form, key) || null;
}

function initialSegments(
  initial: Record<string, unknown> | undefined,
): LeaveSegment[] {
  return Array.isArray(initial?.segments)
    ? (initial.segments as LeaveSegment[])
    : [];
}

export function RecordForm({
  resource,
  mode,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [sendChecked, setSendChecked] = useState(false);

  // 휴가는 "구간" 단위로 저장하므로 이 부분만 제어 컴포넌트로 다룬다.
  const [leaveStart, setLeaveStart] = useState(() =>
    stringValue(initial, "startDate"),
  );
  const [leaveEnd, setLeaveEnd] = useState(() =>
    stringValue(initial, "endDate"),
  );
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() => {
    const segments = initialSegments(initial);
    return segments.length
      ? segmentsToDrafts(segments)
      : fitDrafts(
          [],
          stringValue(initial, "startDate"),
          stringValue(initial, "endDate"),
        );
  });
  const leaveRangeValid = Boolean(
    leaveStart && leaveEnd && leaveStart <= leaveEnd,
  );
  const resolvedDrafts = leaveRangeValid
    ? resolveDrafts(leaveStart, drafts)
    : [];
  const leaveDuration = resolvedDrafts.reduce((sum, d) => sum + d.days, 0);

  /** 기간이 바뀌면 구간을 다시 맞춰 항상 전체를 덮게 한다. */
  const applyLeaveRange = (nextStart: string, nextEnd: string) => {
    setLeaveStart(nextStart);
    setLeaveEnd(nextEnd);
    setDrafts((current) => fitDrafts(current, nextStart, nextEnd));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    switch (resource) {
      case "users":
        onSubmit({
          email: value(form, "email"),
          ...(value(form, "password")
            ? { password: value(form, "password") }
            : {}),
          name: value(form, "name"),
          branch: value(form, "branch"),
          enlistedAt: value(form, "enlistedAt"),
          dischargeAt: value(form, "dischargeAt"),
          signupRank: value(form, "signupRank"),
          unitId: nullable(form, "unitId"),
          ...(mode === "create"
            ? { dataConsent: form.get("dataConsent") === "on" }
            : { consented: form.get("consented") === "on" }),
        });
        break;
      case "units":
        onSubmit({
          name: value(form, "name"),
          description: nullable(form, "description"),
          maxLeaveCount: Number(value(form, "maxLeaveCount")),
          ...(mode === "create" ? { creatorId: value(form, "creatorId") } : {}),
          adminId: value(form, "adminId"),
        });
        break;
      case "leaves":
        onSubmit({
          userId: value(form, "userId"),
          title: value(form, "title"),
          reason: nullable(form, "reason"),
          segments: draftsToSegments(leaveStart, drafts),
          sendNotifications: sendChecked,
        });
        break;
      case "notifications":
        onSubmit({
          ...(mode === "create" ? { userId: value(form, "userId") } : {}),
          title: value(form, "title"),
          body: value(form, "body"),
          leaveId: nullable(form, "leaveId"),
          dates: value(form, "dates")
            .split(",")
            .map((date) => date.trim())
            .filter(Boolean),
          ...(mode === "create"
            ? { sendPush: sendChecked }
            : { read: form.get("read") === "on" }),
        });
        break;
      case "admins":
        onSubmit({
          email: value(form, "email"),
          name: value(form, "name"),
          role: value(form, "role"),
          ...(mode === "edit" ? { active: form.get("active") === "on" } : {}),
        });
        break;
    }
  };

  return (
    <form className="record-form" onSubmit={submit}>
      {resource === "users" ? (
        <>
          <div className="form-grid">
            <Field
              label="이메일"
              name="email"
              type="email"
              required
              initial={initial}
            />
            <Field
              label={mode === "create" ? "임시 비밀번호" : "새 비밀번호 (선택)"}
              name="password"
              type="password"
              minLength={12}
              required={mode === "create"}
              initial={undefined}
            />
            <Field label="이름" name="name" required initial={initial} />
            <SelectField
              label="군 종류"
              name="branch"
              initial={initial}
              options={[
                ["army", "육군"],
                ["navy", "해군"],
                ["air_force", "공군"],
              ]}
            />
            <Field
              label="입대일"
              name="enlistedAt"
              type="date"
              required
              initial={initial}
            />
            <Field
              label="전역 예정일"
              name="dischargeAt"
              type="date"
              required
              initial={initial}
            />
            <SelectField
              label="가입 계급"
              name="signupRank"
              initial={initial}
              options={[
                ["private", "이병"],
                ["private_first", "일병"],
                ["corporal", "상병"],
                ["sergeant", "병장"],
              ]}
            />
            <Field label="부대 ID (선택)" name="unitId" initial={initial} />
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              name={mode === "create" ? "dataConsent" : "consented"}
              defaultChecked={
                mode === "create" ? false : Boolean(initial?.consentedAt)
              }
            />
            <span>
              {mode === "create"
                ? "사용자의 개인정보 수집 동의를 확인했습니다"
                : "개인정보 수집 동의 상태"}
            </span>
          </label>
        </>
      ) : null}

      {resource === "units" ? (
        <div className="form-grid">
          <Field label="부대 이름" name="name" required initial={initial} />
          <Field label="설명" name="description" initial={initial} />
          <Field
            label="하루 최대 출타 인원"
            name="maxLeaveCount"
            type="number"
            min={0}
            required
            initial={initial}
          />
          {mode === "create" ? (
            <Field
              label="생성자 사용자 ID"
              name="creatorId"
              required
              initial={initial}
            />
          ) : null}
          <Field
            label="부대 관리자 사용자 ID"
            name="adminId"
            required
            initial={initial}
          />
        </div>
      ) : null}

      {resource === "leaves" ? (
        <>
          <div className="form-grid">
            <Field label="사용자 ID" name="userId" required initial={initial} />
            <Field label="휴가 제목" name="title" required initial={initial} />
            <label className="field">
              <span>시작일</span>
              <input
                type="date"
                value={leaveStart}
                required
                onChange={(event) => {
                  const next = event.target.value;
                  applyLeaveRange(
                    next,
                    !leaveEnd || leaveEnd < next ? next : leaveEnd,
                  );
                }}
              />
            </label>
            <label className="field">
              <span>종료일</span>
              <input
                type="date"
                value={leaveEnd}
                min={leaveStart || undefined}
                required
                onChange={(event) =>
                  applyLeaveRange(leaveStart, event.target.value)
                }
              />
            </label>
            <label className="field form-span">
              <span>사유</span>
              <textarea
                name="reason"
                rows={4}
                defaultValue={stringValue(initial, "reason")}
              />
            </label>
          </div>

          <div className="field">
            <span>휴가 구간 — 언제부터 언제까지가 어떤 휴가인지</span>
            {leaveRangeValid ? (
              <>
                {resolvedDrafts.map((draft, index) => {
                  const isLast = index === resolvedDrafts.length - 1;
                  // 뒤에 남은 구간 수만큼 최소 하루씩 남겨둬야 한다.
                  const maxEnd = addDays(
                    leaveEnd,
                    -(resolvedDrafts.length - 1 - index),
                  );
                  return (
                    <div key={index} className="form-grid">
                      <label className="field">
                        <span>재원</span>
                        <select
                          value={draft.key}
                          onChange={(event) =>
                            setDrafts((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      key: event.target.value as BalanceKey,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {BALANCE_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {BALANCE_LABELS[key]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>
                          {draft.startDate} 부터 ({draft.days}일)
                        </span>
                        <input
                          type="date"
                          value={draft.endDate}
                          min={draft.startDate}
                          max={maxEnd}
                          disabled={isLast}
                          onChange={(event) =>
                            setDrafts((current) =>
                              setDraftEnd(
                                current,
                                index,
                                event.target.value,
                                leaveStart,
                                leaveEnd,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={resolvedDrafts.length <= 1}
                        onClick={() =>
                          setDrafts((current) =>
                            removeDraft(current, index, leaveStart, leaveEnd),
                          )
                        }
                      >
                        구간 삭제
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={leaveDuration <= resolvedDrafts.length}
                  onClick={() =>
                    setDrafts((current) => {
                      const next = splitLastDraft(
                        current,
                        leaveStart,
                        leaveEnd,
                        "regular_overnight",
                      );
                      return next ?? current;
                    })
                  }
                >
                  구간 추가
                </button>
              </>
            ) : (
              <span>시작일과 종료일을 먼저 골라주세요.</span>
            )}
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={sendChecked}
              onChange={(event) => setSendChecked(event.target.checked)}
            />
            <span>변경 후 최대 출타 인원 초과 알림을 발송합니다</span>
          </label>
        </>
      ) : null}

      {resource === "notifications" ? (
        <>
          <div className="form-grid">
            {mode === "create" ? (
              <Field
                label="대상 사용자 ID"
                name="userId"
                required
                initial={initial}
              />
            ) : null}
            <Field label="제목" name="title" required initial={initial} />
            <label className="field form-span">
              <span>내용</span>
              <textarea
                name="body"
                rows={5}
                required
                defaultValue={stringValue(initial, "body")}
              />
            </label>
            <Field
              label="연관 휴가 ID (선택)"
              name="leaveId"
              initial={initial}
            />
            <Field
              label="관련 날짜 (쉼표로 구분)"
              name="dates"
              defaultValue={
                Array.isArray(initial?.dates)
                  ? initial.dates.join(", ")
                  : stringValue(initial, "dates")
              }
            />
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              name={mode === "create" ? "sendPush" : "read"}
              checked={mode === "create" ? sendChecked : undefined}
              defaultChecked={
                mode === "edit" ? Boolean(initial?.read) : undefined
              }
              onChange={
                mode === "create"
                  ? (event) => setSendChecked(event.target.checked)
                  : undefined
              }
            />
            <span>
              {mode === "create" ? "Expo 푸시도 함께 발송합니다" : "읽음 상태"}
            </span>
          </label>
        </>
      ) : null}

      {resource === "admins" ? (
        <>
          <div className="form-grid">
            {mode === "create" ? (
              <Field
                label="이메일"
                name="email"
                type="email"
                required
                initial={initial}
              />
            ) : (
              <div className="field">
                <span>이메일</span>
                <div className="read-only-field">
                  {stringValue(initial, "email")}
                </div>
              </div>
            )}
            <Field label="이름" name="name" required initial={initial} />
            <SelectField
              label="역할"
              name="role"
              initial={initial}
              options={[
                ["admin", "관리자"],
                ["owner", "Owner"],
              ]}
            />
          </div>
          {mode === "edit" ? (
            <label className="check-field">
              <input
                type="checkbox"
                name="active"
                defaultChecked={Boolean(initial?.active)}
              />
              <span>활성 관리자 계정</span>
            </label>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-actions">
        <button className="button secondary" type="button" onClick={onCancel}>
          취소
        </button>
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={17} /> : null}
          {mode === "create" ? "생성" : "변경 저장"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  initial,
  defaultValue,
  ...inputProps
}: {
  label: string;
  name: string;
  initial?: Record<string, unknown>;
  defaultValue?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "name" | "defaultValue"
>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? stringValue(initial, name)}
        {...inputProps}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  initial,
  options,
}: {
  label: string;
  name: string;
  initial?: Record<string, unknown>;
  options: Array<[string, string]>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={stringValue(initial, name) || options[0]?.[0]}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
