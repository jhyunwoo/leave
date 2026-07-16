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
