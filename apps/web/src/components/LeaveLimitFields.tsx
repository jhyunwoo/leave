/**
 * 하루 최대 출타 인원 입력 필드.
 * 사용처: 그룹 생성(UnitsPage)과 그룹 관리(UnitManagePage).
 * 이 값이 달력의 초과 판정 기준이 되므로 두 화면이 같은 컴포넌트를 쓴다.
 */

import { Field } from "./Field";

/** 하루 최대 출타 인원 — 부대 관리자가 직접 지정한다. */
export function LeaveLimitFields(props: {
  count: string;
  onCountChange: (value: string) => void;
}) {
  const count = Number(props.count);
  const hint = Number.isFinite(count)
    ? `하루에 최대 ${Math.max(0, Math.floor(count))}명까지 출타할 수 있어요.`
    : "하루에 몇 명까지 나갈 수 있는지 인원으로 적어주세요.";

  return (
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
  );
}
