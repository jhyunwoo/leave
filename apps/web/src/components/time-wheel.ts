/**
 * 시각 휠(TimeField)의 산술.
 *
 * 스크롤 위치와 목록 인덱스 사이를 오가는 계산만 모았다. DOM을 만지지 않아
 * 단위 테스트로 고정할 수 있고, 컴포넌트에는 "언제 무엇을 부르는가"만 남는다.
 */

/** 한 칸의 높이(px). CSS의 `--tf-item-h`와 같은 값이어야 한다. */
export const WHEEL_ITEM_HEIGHT = 36;

/** 한 번에 보이는 칸 수. 홀수라야 고른 값이 한가운데 선다. */
export const WHEEL_VISIBLE_ITEMS = 5;

/** 목록 위아래에 덧대는 여백 — 첫 칸과 마지막 칸도 한가운데까지 올라와야 한다. */
export const WHEEL_PAD = ((WHEEL_VISIBLE_ITEMS - 1) / 2) * WHEEL_ITEM_HEIGHT;

const pad2 = (value: number) => value.toString().padStart(2, "0");

export const HOUR_OPTIONS: readonly string[] = Array.from(
  { length: 24 },
  (_, hour) => pad2(hour),
);

/**
 * 1분 단위다. OS 기본 시각 피커(iOS 휠, Android 시계판)에는 눈금 간격을 정하는
 * 방법이 없어 앱이 1분 단위로 값을 만든다. 웹만 5분 눈금을 쓰면 같은 사람이
 * 앱에서 만든 일정을 웹에서 열었을 때 고를 수 없는 값이 생긴다.
 */
export const MINUTE_OPTIONS: readonly string[] = Array.from(
  { length: 60 },
  (_, minute) => pad2(minute),
);

/** `"21:30"` → `{ hour: "21", minute: "30" }`. 값이 없으면 빈 문자열 둘. */
export function splitTime(value: string): { hour: string; minute: string } {
  const [hour = "", minute = ""] = value ? value.split(":") : [];
  return { hour, minute };
}

export function joinTime(hour: string, minute: string): string {
  return `${hour}:${minute}`;
}

/** 목록에 없는 값(빈 값 포함)은 첫 칸으로 본다. */
export function indexOfOption(
  options: readonly string[],
  value: string,
): number {
  const index = options.indexOf(value);
  return index < 0 ? 0 : index;
}

export function scrollTopForIndex(
  index: number,
  itemHeight = WHEEL_ITEM_HEIGHT,
): number {
  return index * itemHeight;
}

/** 지금 스크롤 위치에 가장 가까운 칸. 스냅이 끝난 뒤에 부른다. */
export function indexFromScrollTop(
  scrollTop: number,
  count: number,
  itemHeight = WHEEL_ITEM_HEIGHT,
): number {
  return clampIndex(Math.round(scrollTop / itemHeight), count);
}

/** 키보드로 옮긴 자리. 목록 밖으로 나가지 않는다 — 휠은 돌지 않는다. */
export function moveIndex(index: number, delta: number, count: number): number {
  return clampIndex(index + delta, count);
}

function clampIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(index, count - 1);
}
