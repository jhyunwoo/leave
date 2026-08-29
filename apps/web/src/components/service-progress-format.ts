/** 복무율 숫자와 확대 막대가 공유하는 순수 계산. */

export const SERVICE_PERCENT_DECIMALS = 10;
export const HERO_HEAD_DECIMALS = 2;
export const ZOOM_DECIMAL_PLACE = 5;

export function percentBetween(
  start: number,
  span: number,
  now: number,
): number {
  if (span <= 0) return 0;
  const ratio = (now - start) / span;
  return (ratio < 0 ? 0 : ratio > 1 ? 1 : ratio) * 100;
}

export function formatPercent(percent: number, decimals: number): string {
  return `${percent.toFixed(decimals)}%`;
}

export function splitPercentText(
  text: string,
  headDecimals: number,
): { head: string; tail: string } {
  const dot = text.indexOf(".");
  if (dot < 0) return { head: text, tail: "" };
  const cut = dot + 1 + headDecimals;
  return { head: text.slice(0, cut), tail: text.slice(cut) };
}

/** 지정한 소수 자리 한 칸을 0→1 범위로 펼친다. */
export function zoomFraction(percent: number, decimalPlace: number): number {
  if (!Number.isFinite(percent)) return 0;
  const scaled = percent * Math.pow(10, decimalPlace);
  const fraction = scaled - Math.floor(scaled);
  return fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
}

/** 확대 막대가 한 바퀴 도는 실제 시간(초). */
export function zoomSweepSeconds(span: number, decimalPlace: number): number {
  if (span <= 0) return 0;
  return ((span / 100) * Math.pow(10, -decimalPlace)) / 1000;
}
