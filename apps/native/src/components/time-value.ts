/**
 * `"HH:MM"` 문자열과 OS 시각 피커가 주고받는 `Date` 사이의 변환.
 *
 * 이 저장소의 시각은 어디서나 `"HH:MM"` 문자열이다(`localTimeSchema`). `Date`는
 * `@expo/ui`의 `DateTimePicker`와 말을 맞추는 이 경계에서만 쓰고 밖으로 내보내지
 * 않는다. 같은 이유로 `packages/shared`에는 두지 않는다 — 그 패키지의 규칙이
 * "Date 객체를 밖으로 내보내지 않는다"이다.
 */

/** `Date`를 만들 때 쓰는 고정 기준일. */
const REFERENCE_YEAR = 2000;
const REFERENCE_MONTH = 0;
const REFERENCE_DAY = 1;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * `"21:30"` → 그 시각을 가리키는 `Date`. 값이 비었거나 형식이 어긋나면 `fallback`을 쓴다.
 *
 * 오늘 날짜(`new Date()`)를 쓰지 않는다. 서머타임이 있는 지역에서는 그날 존재하지
 * 않는 시각이 있고(예: 시계를 한 시간 당기는 날의 02:30), 그런 시각을 만들면 런타임이
 * 03:30으로 밀어 버려 되읽은 값이 사용자가 고른 값과 달라진다. 한국에는 서머타임이
 * 없지만 기기의 시간대는 사용자의 것이다. 전환이 일어나지 않는 고정된 날에 시·분만
 * 얹으면 그 자리를 피할 수 있다.
 */
export function timeToDate(value: string, fallback: string): Date {
  const parts = TIME_PATTERN.exec(value) ?? TIME_PATTERN.exec(fallback);
  const hour = parts ? Number(parts[1]) : 0;
  const minute = parts ? Number(parts[2]) : 0;
  return new Date(
    REFERENCE_YEAR,
    REFERENCE_MONTH,
    REFERENCE_DAY,
    hour,
    minute,
    0,
    0,
  );
}

/** 피커가 돌려준 `Date` → `"21:30"`. 기기 시간대의 시·분을 그대로 읽는다. */
export function dateToTime(date: Date): string {
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${hour}:${minute}`;
}
