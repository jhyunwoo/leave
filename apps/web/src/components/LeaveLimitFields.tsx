/**
 * 출타 집계 기준 입력 — 하루 최대 출타 인원과, 외출을 거기에 넣을지.
 * 사용처: 그룹 생성(UnitsPage)과 그룹 관리(UnitManagePage).
 * 이 값들이 달력의 초과 판정 기준이 되므로 두 화면이 같은 컴포넌트를 쓴다.
 */

import { Field } from "./Field";

/** 하루 최대 출타 인원과 외출 포함 여부 — 부대 관리자가 직접 지정한다. */
export function LeaveLimitFields(props: {
  count: string;
  onCountChange: (value: string) => void;
  outingCounts: boolean;
  onOutingCountsChange: (value: boolean) => void;
}) {
  const count = Number(props.count);
  const hint = Number.isFinite(count)
    ? `하루에 최대 ${Math.max(0, Math.floor(count))}명까지 출타할 수 있어요.`
    : "하루에 몇 명까지 나갈 수 있는지 인원으로 적어주세요.";

  return (
    <>
      <Field label="하루 최대 출타 인원" hint={hint}>
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
      </Field>

      <Field
        label="외출을 출타율에 포함"
        hint="끄면 외출한 날은 하루 최대 출타 인원 계산에서 빠져요. 출타 명단에는 그대로 보입니다."
      >
        <label
          style={{
            display: "flex",
            gap: "var(--sp-sm)",
            alignItems: "center",
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          <input
            type="checkbox"
            checked={props.outingCounts}
            onChange={(event) =>
              props.onOutingCountsChange(event.target.checked)
            }
            style={{ width: 20, height: 20, flexShrink: 0 }}
            data-testid="unit-outing-counts"
          />
          <span className="body-sm text-body">
            외출도 그날 출타 인원으로 센다
          </span>
        </label>
      </Field>
    </>
  );
}
