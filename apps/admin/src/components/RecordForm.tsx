import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

export type EditableResource =
  | "users"
  | "units"
  | "leaves"
  | "join-requests"
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
          maxLeaveNumerator: Number(value(form, "maxLeaveNumerator")),
          maxLeaveDenominator: Number(value(form, "maxLeaveDenominator")),
          ...(mode === "create" ? { creatorId: value(form, "creatorId") } : {}),
          adminId: value(form, "adminId"),
          headcount: value(form, "headcount")
            ? Number(value(form, "headcount"))
            : null,
        });
        break;
      case "leaves":
        onSubmit({
          userId: value(form, "userId"),
          title: value(form, "title"),
          startDate: value(form, "startDate"),
          endDate: value(form, "endDate"),
          reason: nullable(form, "reason"),
          sendNotifications: sendChecked,
        });
        break;
      case "join-requests":
        onSubmit({
          userId: value(form, "userId"),
          unitId: value(form, "unitId"),
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
            label="최대 휴가 인원 분자"
            name="maxLeaveNumerator"
            type="number"
            min={1}
            required
            initial={initial}
          />
          <Field
            label="최대 휴가 인원 분모"
            name="maxLeaveDenominator"
            type="number"
            min={1}
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
          <Field
            label="기준 인원 (선택)"
            name="headcount"
            type="number"
            min={1}
            initial={initial}
          />
        </div>
      ) : null}

      {resource === "leaves" ? (
        <>
          <div className="form-grid">
            <Field label="사용자 ID" name="userId" required initial={initial} />
            <Field label="휴가 제목" name="title" required initial={initial} />
            <Field
              label="시작일"
              name="startDate"
              type="date"
              required
              initial={initial}
            />
            <Field
              label="종료일"
              name="endDate"
              type="date"
              required
              initial={initial}
            />
            <label className="field form-span">
              <span>사유</span>
              <textarea
                name="reason"
                rows={4}
                defaultValue={stringValue(initial, "reason")}
              />
            </label>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={sendChecked}
              onChange={(event) => setSendChecked(event.target.checked)}
            />
            <span>변경 후 출타율 초과 알림을 발송합니다</span>
          </label>
        </>
      ) : null}

      {resource === "join-requests" ? (
        <div className="form-grid">
          <Field label="사용자 ID" name="userId" required initial={initial} />
          <Field label="부대 ID" name="unitId" required initial={initial} />
        </div>
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
