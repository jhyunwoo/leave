/**
 * 관리자 화면 공용 표시 형식.
 *
 * 사용처: 목록 표(entity-configs.tsx), 운영 현황(OverviewPage.tsx), 상세 서랍.
 *
 * 관리자 화면은 대부분 `Record<string, unknown>` 형태의 원시 행을 그대로 그린다.
 * 값이 null·빈 문자열·잘못된 날짜일 수 있으므로, "표에 무엇을 찍을지"를 여기서
 * 한 번만 정해 두고 화면마다 다시 정하지 않는다.
 */

/** 관리자 화면의 모든 시각 표기는 한국 로캘 24시간제로 통일한다. */
const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * ISO 문자열을 사람이 읽는 시각으로. 값이 없으면 "—",
 * 날짜로 해석되지 않으면 원문을 그대로 보여준다(디버깅에 필요하다).
 */
export function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

/** 빈 값을 표 안에서 눈에 띄는 대시로 바꾼다. */
export function text(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}
