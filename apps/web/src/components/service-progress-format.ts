/** 복무율 숫자와 막대가 공유하는 순수 계산. */

export const SERVICE_PERCENT_DECIMALS = 10;
export const HERO_HEAD_DECIMALS = 2;

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
