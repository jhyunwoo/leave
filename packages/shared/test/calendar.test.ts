import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  CALENDAR_QUERY_FUTURE_MONTHS,
  CALENDAR_QUERY_PAST_MONTHS,
  fmtDateFullK,
  fmtDateTimeFull,
  fmtDateTimeShort,
  fmtRange,
  isWeekend,
  personalEventCellLabel,
  shiftMonth,
  splitMonth,
} from "../src";

describe("calendar query bounds", () => {
  it("keeps clients and the API on the same relative-month contract", () => {
    expect(CALENDAR_QUERY_PAST_MONTHS).toBe(12);
    expect(CALENDAR_QUERY_FUTURE_MONTHS).toBe(24);
  });
});

describe("shiftMonth", () => {
  it("연도 경계를 넘어 이동", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-06", 0)).toBe("2026-06");
  });
});

describe("splitMonth", () => {
  it("연/월 분리", () => {
    expect(splitMonth("2026-07")).toEqual({ year: 2026, monthNum: 7 });
  });
});

describe("buildMonthGrid", () => {
  it("일요일 시작 그리드이며 해당 월의 모든 날짜를 포함한다", () => {
    const weeks = buildMonthGrid("2026-02");
    // 각 주는 7일
    for (const week of weeks) expect(week.length).toBe(7);
    // 첫 셀은 일요일(0)
    const first = weeks[0]?.[0];
    expect(first).toBeDefined();
    const firstDow = new Date(`${first!.date}T00:00:00Z`).getUTCDay();
    expect(firstDow).toBe(0);
    // 2월의 모든 날짜가 inMonth로 존재
    const inMonth = weeks
      .flat()
      .filter((c) => c.inMonth)
      .map((c) => c.date);
    expect(inMonth).toContain("2026-02-01");
    expect(inMonth).toContain("2026-02-28");
    expect(inMonth.length).toBe(28);
  });
});

describe("isWeekend", () => {
  it("토·일만 true", () => {
    expect(isWeekend("2026-08-14")).toBe(false); // 금
    expect(isWeekend("2026-08-15")).toBe(true); // 토
    expect(isWeekend("2026-08-16")).toBe(true); // 일
    expect(isWeekend("2026-08-17")).toBe(false); // 월
  });

  it("달 경계에서도 요일이 밀리지 않는다", () => {
    expect(isWeekend("2026-02-28")).toBe(true); // 토
    expect(isWeekend("2026-03-01")).toBe(true); // 일
    expect(isWeekend("2026-08-31")).toBe(false); // 월
    expect(isWeekend("2026-09-01")).toBe(false); // 화
  });
});

describe("fmtRange", () => {
  it("같은 날은 단일 표기, 다른 날은 범위 표기", () => {
    expect(fmtRange("2026-07-18", "2026-07-18")).toBe("7월 18일");
    expect(fmtRange("2026-07-18", "2026-07-20")).toContain("–");
  });
});

describe("fmtDateFullK", () => {
  it("연도·월·일·요일을 모두 밝힌다", () => {
    expect(fmtDateFullK("2026-09-18")).toBe("2026년 9월 18일 (금)");
  });

  // 날짜 문자열은 UTC 접근자로 읽는다 — 연말 경계에서 해가 밀리면 안 된다.
  it("연말·연초 경계에서도 해가 밀리지 않는다", () => {
    expect(fmtDateFullK("2025-12-31")).toBe("2025년 12월 31일 (수)");
    expect(fmtDateFullK("2026-01-01")).toBe("2026년 1월 1일 (목)");
  });
});

describe("시각 표기", () => {
  // 기기 로컬 시각으로 보여준다 — 아래 두 함수만 로컬 접근자를 쓴다.
  const at = new Date(2026, 7, 2, 14, 5, 9); // 2026-08-02 14:05:09 (로컬)

  it("목록용 짧은 표기는 분까지 두 자리로 맞춘다", () => {
    expect(fmtDateTimeShort(at.toISOString())).toBe("8월 2일 14:05");
  });

  it("한 자리 시·분에도 자리를 채운다", () => {
    const earlyMorning = new Date(2026, 7, 2, 9, 5).toISOString();
    expect(fmtDateTimeShort(earlyMorning)).toBe("8월 2일 09:05");
  });

  it("전체 표기는 한국 로캘을 쓴다", () => {
    expect(fmtDateTimeFull(at.toISOString())).toBe(at.toLocaleString("ko-KR"));
  });
});

describe("personalEventCellLabel", () => {
  it("없는 날은 알약 자체를 그리지 않도록 null을 준다", () => {
    expect(personalEventCellLabel([])).toBeNull();
  });

  it("한 건이면 제목만 적는다", () => {
    expect(personalEventCellLabel([{ title: "치과" }])).toBe("치과");
  });

  it("여러 건이면 첫 제목에 나머지 개수를 접는다", () => {
    expect(personalEventCellLabel([{ title: "치과" }, { title: "면회" }])).toBe(
      "치과 +1",
    );
    expect(
      personalEventCellLabel([
        { title: "치과" },
        { title: "면회" },
        { title: "적금 만기" },
      ]),
    ).toBe("치과 +2");
  });

  it("칸 폭은 CSS가 줄이므로 긴 제목을 자르지 않는다", () => {
    const long = "가".repeat(80);
    expect(personalEventCellLabel([{ title: long }])).toBe(long);
  });
});
