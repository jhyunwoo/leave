import { describe, expect, it } from "vitest";
import type { FeedItem } from "../src/calendar-feed";
import { escapeIcsText, foldIcsLine, renderIcs } from "../src/ics";

const NOW = new Date("2026-10-12T03:04:05.678Z");
const encoder = new TextEncoder();

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    uid: "leave-1",
    title: "[휴가] 여름 휴가",
    description: null,
    startDate: "2026-08-02",
    endDate: "2026-08-05",
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

/** RFC 5545 3.1 펼치기: CRLF 뒤 공백 하나를 지운다. */
function unfold(text: string): string {
  return text.replaceAll("\r\n ", "");
}

describe("escapeIcsText", () => {
  it("역슬래시·세미콜론·쉼표·줄바꿈을 이스케이프한다", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldIcsLine", () => {
  it("75바이트 이하 줄은 그대로 둔다", () => {
    const line = "SUMMARY:" + "a".repeat(67);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("한글 긴 줄을 75바이트 이하로 접고, 펼치면 원문과 같다", () => {
    const line = "SUMMARY:" + "휴가".repeat(100);
    const folded = foldIcsLine(line);
    for (const physical of folded.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(line);
    // 글자 중간에서 자르면 펼친 결과에 U+FFFD가 생긴다.
    expect(folded).not.toContain("�");
  });

  it("이어지는 줄은 공백 하나로 시작한다", () => {
    const folded = foldIcsLine("X:" + "가".repeat(40));
    const [, second] = folded.split("\r\n");
    expect(second?.startsWith(" ")).toBe(true);
  });
});

describe("renderIcs", () => {
  it("캘린더 머리와 시간대 블록을 싣고 CRLF로 끝난다", () => {
    const ics = renderIcs([], { calendarName: "리브", now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:리브\r\n");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Seoul\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("종일 일정의 DTEND는 끝날 다음 날이다", () => {
    const ics = renderIcs([item()], { calendarName: "리브", now: NOW });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260802\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260806\r\n");
  });

  it("달·해 경계를 넘는 종일 일정도 다음 날로 끝난다", () => {
    const ics = renderIcs(
      [item({ startDate: "2026-12-31", endDate: "2026-12-31" })],
      {
        calendarName: "리브",
        now: NOW,
      },
    );
    expect(ics).toContain("DTEND;VALUE=DATE:20270101\r\n");
  });

  it("시각 일정은 서울 시간대로 적는다", () => {
    const ics = renderIcs(
      [
        item({
          startDate: "2026-10-01",
          endDate: "2026-10-02",
          startTime: "09:30",
          endTime: "18:00",
        }),
      ],
      { calendarName: "리브", now: NOW },
    );
    expect(ics).toContain("DTSTART;TZID=Asia/Seoul:20261001T093000\r\n");
    expect(ics).toContain("DTEND;TZID=Asia/Seoul:20261002T180000\r\n");
  });

  it("끝 시간이 없는 시각 일정은 DTEND를 두지 않는다", () => {
    const ics = renderIcs(
      [
        item({
          startDate: "2026-10-01",
          endDate: "2026-10-01",
          startTime: "09:30",
        }),
      ],
      { calendarName: "리브", now: NOW },
    );
    expect(ics).toContain("DTSTART;TZID=Asia/Seoul:20261001T093000\r\n");
    expect(ics).not.toContain("DTEND");
  });

  it("UID·DTSTAMP·SUMMARY·DESCRIPTION을 싣는다", () => {
    const ics = renderIcs(
      [item({ description: "사유: 가족, 행사\n복귀 21:00" })],
      {
        calendarName: "리브",
        now: NOW,
      },
    );
    expect(ics).toContain("UID:leave-1@leave.moveto.kr\r\n");
    expect(ics).toContain("DTSTAMP:20261012T030405Z\r\n");
    expect(ics).toContain("SUMMARY:[휴가] 여름 휴가\r\n");
    expect(unfold(ics)).toContain(
      "DESCRIPTION:사유: 가족\\, 행사\\n복귀 21:00\r\n",
    );
  });

  it("설명이 없으면 DESCRIPTION을 두지 않는다", () => {
    const ics = renderIcs([item()], { calendarName: "리브", now: NOW });
    expect(ics).not.toContain("DESCRIPTION");
  });
});
