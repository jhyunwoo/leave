/**
 * 웹 시각 선택기 — 자주 쓰는 시각 칩과 시·분 드롭다운.
 *
 * 사용처: LeaveFormModal(복귀 시간), PersonalEventModal·UnitEventModal(시작·종료 시간).
 *
 * `<input type="time">`을 쓰지 않는 이유는 입력 방식이다. 브라우저 기본 시간
 * 입력은 데스크톱에서 시·분 자리를 키보드로 채우게 한다. 이 앱에서 고르는 시각은
 * 대부분 정시나 30분이라, 칩 하나와 드롭다운 둘이면 타건 없이 끝난다.
 *
 * 분은 5분 눈금만 늘어놓는다. 저장된 값이 눈금 밖이면(예전 값이나 API로 넣은 값)
 * 그 값만 목록에 끼워 넣는다 — 목록에 없다고 화면이 조용히 다른 시각을 고른
 * 것처럼 보이면, 저장 버튼을 누르는 순간 사용자가 모르는 값이 덮인다.
 *
 * 표기는 24시간이다. 휴가 상세("복귀 예정 21:00")·알림 목록과 같은 말을 써야
 * 한 화면에서 두 표기를 번갈아 읽지 않는다.
 */

import "./time-field.css";

/** 분 드롭다운의 눈금. */
const MINUTE_STEP = 5;

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  hour.toString().padStart(2, "0"),
);

/** 5분 눈금에 지금 값의 분을 더한 목록. 눈금 밖 값도 그대로 고를 수 있게 남긴다. */
function minuteOptions(current: string): string[] {
  const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
    (index * MINUTE_STEP).toString().padStart(2, "0"),
  );
  if (current && !steps.includes(current)) {
    return [...steps, current].sort();
  }
  return steps;
}

export function TimeField(props: {
  label: string;
  hint?: string;
  /** "HH:MM", 또는 아직 정하지 않았으면 빈 문자열. */
  value: string;
  onChange: (value: string) => void;
  /** 비울 수 있는 시각인가. 개인·부대 일정의 시작·종료 시간이 그렇다. */
  optional?: boolean;
  /** 한 번에 고르는 자주 쓰는 시각. */
  presets?: readonly string[];
  testId?: string;
}) {
  const [hour = "", minute = ""] = props.value ? props.value.split(":") : [];
  const minutes = minuteOptions(minute);

  /**
   * 시를 고르면 분이 비어 있어도 시각이 완성된다 — 정시가 가장 흔하고, 분까지
   * 골라야 값이 생기면 드롭다운 두 개가 모두 "선택하세요"로 남는다.
   */
  const changeHour = (next: string) => {
    if (!next) {
      props.onChange("");
      return;
    }
    props.onChange(`${next}:${minute || "00"}`);
  };

  return (
    <div className="field tf-root">
      <div className="tf-head">
        <span className="field-label">{props.label}</span>
        {props.optional && props.value ? (
          <button
            type="button"
            className="tf-clear"
            onClick={() => props.onChange("")}
            data-testid={props.testId ? `${props.testId}-clear` : undefined}
          >
            지우기
          </button>
        ) : null}
      </div>

      {props.presets?.length ? (
        <div className="tf-presets">
          {props.presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`tf-preset ${props.value === preset ? "is-active" : ""}`}
              aria-pressed={props.value === preset}
              onClick={() => props.onChange(preset)}
              data-testid={
                props.testId ? `${props.testId}-preset-${preset}` : undefined
              }
            >
              {preset}
            </button>
          ))}
        </div>
      ) : null}

      <div className="tf-selects">
        <select
          className="input"
          aria-label={`${props.label} 시`}
          value={hour}
          onChange={(event) => changeHour(event.target.value)}
          data-testid={props.testId ? `${props.testId}-hour` : undefined}
        >
          {/* 값이 없는 동안에는 빈 항목이 있어야 select가 첫 항목을 고른 것처럼
              보이지 않는다. 값이 생기면 필수 필드에서는 이 항목을 걷어낸다. */}
          {props.optional || !props.value ? (
            <option value="">
              {props.optional ? "지정 안 함" : "시 선택"}
            </option>
          ) : null}
          {HOURS.map((value) => (
            <option key={value} value={value}>
              {Number(value)}시
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label={`${props.label} 분`}
          value={minute}
          disabled={!props.value}
          onChange={(event) =>
            props.onChange(`${hour || "00"}:${event.target.value}`)
          }
          data-testid={props.testId ? `${props.testId}-minute` : undefined}
        >
          {/* 시를 고르기 전에는 분만 따로 정할 수 없다. 빈 칸으로 두면 고장처럼
              보이므로 무엇을 고르는 자리인지 적어 둔다. */}
          {props.value ? null : <option value="">분</option>}
          {minutes.map((value) => (
            <option key={value} value={value}>
              {value}분
            </option>
          ))}
        </select>
      </div>

      {props.hint ? <span className="field-hint">{props.hint}</span> : null}
    </div>
  );
}
