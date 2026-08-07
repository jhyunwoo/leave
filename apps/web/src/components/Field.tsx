/**
 * 라벨 + 입력 + 힌트/오류를 묶는 폼 필드 껍데기.
 *
 * 사용처: 웹의 모든 폼. 오류가 있으면 힌트 대신 오류를 보여줘,
 * 같은 자리에서 두 문구가 겹쳐 레이아웃이 흔들리지 않게 한다.
 */

import type { ReactNode } from "react";

export function Field(props: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="field-label">{props.label}</span>
        {props.children}
      </label>
      {props.error ? (
        <span className="field-error">{props.error}</span>
      ) : props.hint ? (
        <span className="field-hint">{props.hint}</span>
      ) : null}
    </div>
  );
}
