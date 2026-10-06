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

/** 해석할 수 없는 날짜는 디버깅을 위해 원문으로 표시한다. */
export function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

/** 서버의 임의 필드를 표시하는 경계이며, 비어 있는 값은 명시한다. */
export function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "없음";
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 위 주석: 의도적인 표시 경계
  return String(value);
}

/** 상세 화면에서는 객체를 JSON으로 펼쳐 원본 필드를 확인할 수 있게 한다. */
export function detailText(value: unknown): string {
  if (value === null || value === undefined) return "없음";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 서버 원본 값을 그대로 보여주는 의도적 경계
  return String(value);
}
