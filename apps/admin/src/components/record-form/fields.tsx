/**
 * 관리자 폼의 입력 원시 요소.
 *
 * 사용처: record-form/ 아래 리소스별 폼 전부.
 *
 * 관리자 폼은 대부분 비제어(defaultValue) 입력이다. 서버가 준 행을 초기값으로 깔고
 * 제출 시 FormData에서 한 번에 읽는다 — 필드마다 useState를 두면 리소스 다섯 개
 * 분량의 상태가 화면 하나에 쌓인다. 제어가 필요한 곳(휴가 구간)만 예외다.
 */

import type { InputHTMLAttributes } from "react";

/** 서버가 준 행. 리소스마다 모양이 달라 필요한 키만 꺼내 쓴다. */
export type InitialRecord = Record<string, unknown>;

/** 초기값으로 쓸 문자열. null·undefined는 빈 값으로 본다. */
export function initialString(
  initial: InitialRecord | undefined,
  key: string,
): string {
  const value = initial?.[key];
  if (value === null || value === undefined) return "";
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 서버 원본 값을 입력 기본값으로 그대로 쓰는 의도적 경계
  return String(value);
}

export function Field({
  label,
  name,
  initial,
  defaultValue,
  ...inputProps
}: {
  label: string;
  name: string;
  initial?: InitialRecord;
  defaultValue?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? initialString(initial, name)}
        {...inputProps}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  initial,
  options,
}: {
  label: string;
  name: string;
  initial?: InitialRecord;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={initialString(initial, name) || options[0]?.[0]}
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

export function TextAreaField({
  label,
  name,
  initial,
  rows,
  required,
}: {
  label: string;
  name: string;
  initial?: InitialRecord;
  rows: number;
  required?: boolean;
}) {
  return (
    <label className="field form-span">
      <span>{label}</span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        defaultValue={initialString(initial, name)}
      />
    </label>
  );
}

export function CheckField({
  label,
  name,
  defaultChecked,
  checked,
  onChange,
}: {
  label: string;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={
          onChange ? (event) => onChange(event.target.checked) : undefined
        }
      />
      <span>{label}</span>
    </label>
  );
}
