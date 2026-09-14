/**
 * 웹 시각 선택기 — 눌러서 펼치는 줄 + iOS 휠을 닮은 시·분 스크롤.
 *
 * 사용처: LeaveFormModal(복귀 시간), PersonalEventModal·UnitEventModal(시작·종료 시간).
 *
 * `<input type="time">`을 쓰지 않는 이유는 입력 방식이다. 브라우저 기본 시간 입력은
 * 데스크톱에서 시·분 자리를 키보드로 채우게 한다. 굴려서 고르는 편이 빠르고, 앱의
 * 시각 피커와 같은 몸짓이 된다.
 *
 * 접었다 펴는 줄을 쓰는 이유는 자리다. 개인·부대 일정 폼은 시작·종료 두 개를 나란히
 * 세우는데(`.tf-pair`), 휠 둘이 언제나 펼쳐져 있으면 480px 모달이 휠로만 찬다.
 *
 * 분은 1분 단위다 — 근거는 `time-wheel.ts`에 적어 두었다.
 *
 * 표기는 24시간이다. 휴가 상세("복귀 예정 21:00")·알림 목록과 같은 말을 써야
 * 한 화면에서 두 표기를 번갈아 읽지 않는다.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  WHEEL_ITEM_HEIGHT,
  WHEEL_PAD,
  indexFromScrollTop,
  indexOfOption,
  joinTime,
  moveIndex,
  scrollTopForIndex,
  splitTime,
} from "./time-wheel";
import "./time-field.css";

/** 값이 없는 채로 펼쳤을 때 휠이 가리킬 시각. */
const DEFAULT_TIME = "09:00";

/**
 * 칸 높이와 위아래 여백은 CSS가 그리고 자바스크립트가 계산한다. 두 곳에 숫자를
 * 적어 두면 언젠가 한쪽만 바뀌고 고른 값이 한 칸씩 밀린다 — 값은 여기서만 나온다.
 */
const WHEEL_METRICS = {
  "--tf-item-h": `${WHEEL_ITEM_HEIGHT}px`,
  "--tf-pad": `${WHEEL_PAD}px`,
} as CSSProperties;

/**
 * 스크롤이 멎었다고 보는 시간(ms).
 *
 * `scrollend`를 쓰지 않는다 — 아직 못 받는 브라우저가 있고, 어차피 fallback을
 * 함께 두어야 한다면 둘 중 하나만 두는 편이 동작이 한 가지로 유지된다.
 */
const SETTLE_MS = 120;

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
  /** 값이 없는 채로 펼쳤을 때 시작할 시각. */
  defaultTime?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { hour, minute } = splitTime(props.value);

  /**
   * 휠은 언제나 무언가를 가리킨다. 값이 빈 채로 펼치면 줄은 "지정 안 함"인데 휠은
   * 9시를 보여주는 상태가 남으므로, 펼치는 순간 그 시각을 값으로 확정한다.
   */
  const toggle = () => {
    // 값 확정은 updater 밖에서 한다 — updater는 렌더 중에 돌아, 안에서 부모의
    // state를 건드리면 "다른 컴포넌트를 렌더하는 중에 갱신했다"는 경고가 난다.
    if (!open && !props.value)
      props.onChange(props.defaultTime || DEFAULT_TIME);
    setOpen(!open);
  };

  return (
    <div className="field tf-root">
      <button
        type="button"
        className={`tf-row ${open ? "is-open" : ""}`}
        aria-expanded={open}
        onClick={toggle}
        data-testid={props.testId}
      >
        <span className="tf-row-text">
          <span className="field-label">{props.label}</span>
          <span className={`tf-value ${props.value ? "" : "is-empty"}`}>
            {props.value || "지정 안 함"}
          </span>
        </span>
        <span className="tf-change">{open ? "접기" : "변경"}</span>
      </button>

      {open ? (
        <div className="tf-panel">
          {props.presets?.length ? (
            <div className="tf-presets">
              {props.presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`tf-preset ${props.value === preset ? "is-active" : ""}`}
                  aria-pressed={props.value === preset}
                  onClick={() => {
                    props.onChange(preset);
                    // 자주 쓰는 값을 눌렀으면 고를 것이 남지 않는다.
                    setOpen(false);
                  }}
                  data-testid={
                    props.testId
                      ? `${props.testId}-preset-${preset}`
                      : undefined
                  }
                >
                  {preset}
                </button>
              ))}
            </div>
          ) : null}

          <div className="tf-wheels" style={WHEEL_METRICS}>
            <WheelColumn
              label={`${props.label} 시`}
              unit="시"
              options={HOUR_OPTIONS}
              value={hour}
              onChange={(next) => props.onChange(joinTime(next, minute))}
              testId={props.testId ? `${props.testId}-hour` : undefined}
            />
            <WheelColumn
              label={`${props.label} 분`}
              unit="분"
              options={MINUTE_OPTIONS}
              value={minute}
              onChange={(next) => props.onChange(joinTime(hour, next))}
              testId={props.testId ? `${props.testId}-minute` : undefined}
            />
            <div className="tf-wheel-band" aria-hidden="true" />
          </div>

          {props.optional && props.value ? (
            <button
              type="button"
              className="tf-clear"
              onClick={() => {
                props.onChange("");
                setOpen(false);
              }}
              data-testid={props.testId ? `${props.testId}-clear` : undefined}
            >
              시간 지우기
            </button>
          ) : null}
        </div>
      ) : null}

      {props.hint ? <span className="field-hint">{props.hint}</span> : null}
    </div>
  );
}

/**
 * 한 열짜리 휠.
 *
 * 굴리기는 CSS 스크롤 스냅이 한다. 자바스크립트가 하는 일은 두 가지뿐이다 —
 * 밖에서 값이 바뀌면 스크롤을 그 자리로 맞추고(외부 시스템 동기화라 effect가 맞다),
 * 스크롤이 멎으면 그 자리의 값을 알린다.
 */
function WheelColumn(props: {
  label: string;
  unit: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  testId?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 첫 배치는 애니메이션 없이 — 폼을 열자마자 휠이 굴러가면 고장처럼 보인다. */
  const placed = useRef(false);
  const index = indexOfOption(props.options, props.value);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const top = scrollTopForIndex(index);
    // 이미 그 자리면 건드리지 않는다. 사용자가 굴려서 닿은 자리를 다시 밀면 튄다.
    if (Math.abs(element.scrollTop - top) < 1) {
      placed.current = true;
      return;
    }
    element.scrollTo({ top, behavior: placed.current ? "smooth" : "auto" });
    placed.current = true;
  }, [index]);

  useEffect(() => {
    return () => {
      if (settle.current) clearTimeout(settle.current);
    };
  }, []);

  const commitWhenSettled = () => {
    const element = scroller.current;
    if (!element) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const landed =
        props.options[
          indexFromScrollTop(element.scrollTop, props.options.length)
        ];
      if (landed && landed !== props.value) props.onChange(landed);
    }, SETTLE_MS);
  };

  const move = (delta: number) => {
    const next = props.options[moveIndex(index, delta, props.options.length)];
    if (next && next !== props.value) props.onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: 5,
      PageUp: -5,
    }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      move(step);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      move(-props.options.length);
    } else if (event.key === "End") {
      event.preventDefault();
      move(props.options.length);
    }
  };

  const listId = useId();
  const optionId = (option: string) => `${listId}-${option}`;

  return (
    <div
      ref={scroller}
      className="tf-wheel"
      role="listbox"
      tabIndex={0}
      aria-label={props.label}
      aria-activedescendant={optionId(props.options[index] ?? "")}
      onScroll={commitWhenSettled}
      onKeyDown={onKeyDown}
      data-testid={props.testId}
    >
      {props.options.map((option) => (
        <div
          key={option}
          id={optionId(option)}
          role="option"
          aria-selected={option === props.value}
          aria-label={`${Number(option)}${props.unit}`}
          className={`tf-wheel-item ${option === props.value ? "is-active" : ""}`}
          onClick={() => props.onChange(option)}
          data-testid={props.testId ? `${props.testId}-${option}` : undefined}
        >
          {option}
        </div>
      ))}
    </div>
  );
}
