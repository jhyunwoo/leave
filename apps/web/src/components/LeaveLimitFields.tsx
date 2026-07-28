import { Field } from "./Field";

export type LeaveLimitMode = "ratio" | "count";

const RATIO_PRESETS = [
  { n: 1, d: 3 },
  { n: 1, d: 4 },
  { n: 1, d: 5 },
] as const;

export function LeaveLimitFields(props: {
  mode: LeaveLimitMode;
  onModeChange: (mode: LeaveLimitMode) => void;
  numerator: number;
  denominator: number;
  onNumeratorChange: (value: number) => void;
  onDenominatorChange: (value: number) => void;
  count: string;
  onCountChange: (value: string) => void;
  basis: number;
  basisLabel: string;
}) {
  const count = Number(props.count) || 0;
  const ratioAllowed =
    props.denominator > 0
      ? Math.floor((props.basis * props.numerator) / props.denominator)
      : 0;
  const hint =
    props.mode === "count"
      ? `하루 최대 ${count}명까지 출타할 수 있어요.`
      : `${props.basisLabel} 기준 하루 최대 ${ratioAllowed}명까지 출타할 수 있어요.`;

  return (
    <Field label="최대 출타 기준" hint={hint}>
      <div
        role="radiogroup"
        aria-label="최대 출타 기준 방식"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          padding: 4,
          borderRadius: "var(--r-md)",
          background: "var(--canvas-soft)",
        }}
      >
        {(
          [
            ["ratio", "비율로 계산"],
            ["count", "인원 직접 지정"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={props.mode === mode}
            className={`btn btn-sm ${
              props.mode === mode ? "btn-primary" : "btn-secondary"
            }`}
            onClick={() => props.onModeChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {props.mode === "ratio" ? (
        <div
          style={{
            display: "flex",
            gap: "var(--sp-sm)",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {RATIO_PRESETS.map((preset) => {
            const active =
              props.numerator === preset.n && props.denominator === preset.d;
            return (
              <button
                key={`${preset.n}/${preset.d}`}
                type="button"
                className={`btn btn-sm ${
                  active ? "btn-primary" : "btn-secondary"
                }`}
                aria-pressed={active}
                onClick={() => {
                  props.onNumeratorChange(preset.n);
                  props.onDenominatorChange(preset.d);
                }}
              >
                {preset.n}/{preset.d}
              </button>
            );
          })}
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
              value={props.numerator}
              onChange={(event) =>
                props.onNumeratorChange(Number(event.target.value))
              }
              style={{ width: 64, textAlign: "center" }}
              aria-label="출타율 분자"
            />
            <span className="strong">/</span>
            <input
              className="input"
              type="number"
              min={1}
              value={props.denominator}
              onChange={(event) =>
                props.onDenominatorChange(Number(event.target.value))
              }
              style={{ width: 64, textAlign: "center" }}
              aria-label="출타율 분모"
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            className="input"
            type="number"
            min={0}
            max={100000}
            value={props.count}
            onChange={(event) => props.onCountChange(event.target.value)}
            style={{ width: 160, textAlign: "center" }}
            aria-label="하루 최대 출타 인원"
          />
          <span className="strong">명</span>
        </div>
      )}
    </Field>
  );
}
