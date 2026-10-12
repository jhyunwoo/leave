/**
 * 외부 캘린더 구독 피드(iCalendar, RFC 5545) 렌더러.
 *
 * 사용처: apps/api의 `GET /calendar/:token.ics`.
 *
 * 여기 규칙은 틀려도 오류가 나지 않는다. 캘린더 앱이 일정을 **말없이 버리거나 하루
 * 밀어 그린다.** 그래서 형식 규칙마다 테스트가 붙어 있다(test/ics.test.ts).
 */
import type { FeedItem } from "./calendar-feed";
import { addDays, type ISODate } from "./dates";

const CRLF = "\r\n";
/** 한 물리 줄의 상한. 글자 수가 아니라 UTF-8 바이트다 — 한글은 한 글자가 3바이트. */
const MAX_LINE_BYTES = 75;
const UID_DOMAIN = "leave.moveto.kr";
const TZID = "Asia/Seoul";
const encoder = new TextEncoder();

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r\n|\r|\n/g, "\\n");
}

/**
 * 75바이트마다 CRLF + 공백으로 접는다. 코드 포인트 단위로 세어 글자 중간에서
 * 자르지 않는다 — 잘린 한글은 펼친 뒤 깨진 문자로 남는다.
 * 이어지는 줄은 앞의 공백 1바이트를 포함해 75바이트다.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = MAX_LINE_BYTES;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = MAX_LINE_BYTES - 1;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function icsDate(date: ISODate): string {
  return date.replaceAll("-", "");
}

function icsLocalDateTime(date: ISODate, time: string): string {
  return `${icsDate(date)}T${time.replace(":", "")}00`;
}

function icsUtcStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(/[-:]/g, "");
}

function eventLines(item: FeedItem, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${item.uid}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
  ];
  if (item.startTime === null) {
    // 종일 일정의 DTEND는 배타적이다. 끝날을 그대로 적으면 모든 일정이 하루 짧아진다.
    lines.push(`DTSTART;VALUE=DATE:${icsDate(item.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(item.endDate, 1))}`);
  } else {
    lines.push(
      `DTSTART;TZID=${TZID}:${icsLocalDateTime(item.startDate, item.startTime)}`,
    );
    // 끝 시간이 없으면 DTEND를 두지 않는다 — RFC 5545상 시작 시각에 끝나는 일정이다.
    if (item.endTime !== null) {
      lines.push(
        `DTEND;TZID=${TZID}:${icsLocalDateTime(item.endDate, item.endTime)}`,
      );
    }
  }
  lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
  if (item.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function renderIcs(
  items: readonly FeedItem[],
  options: { calendarName: string; now: Date },
): string {
  const stamp = icsUtcStamp(options.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//moveto.kr//Leave//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    `X-WR-TIMEZONE:${TZID}`,
    // 갱신 주기는 결국 각 앱이 정한다. 아이폰은 이 값을 참고하고 구글은 무시한다.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // 한국은 서머타임이 없어 STANDARD 하나로 끝난다.
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...items.flatMap((item) => eventLines(item, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
