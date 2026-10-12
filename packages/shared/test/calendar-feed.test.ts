import { describe, expect, it } from "vitest";
import {
  buildFeedItems,
  calendarFeedWebcalUrl,
  feedRangeStart,
  googleCalendarSubscribeUrl,
  type FeedLeaveInput,
} from "../src/calendar-feed";

function leave(overrides: Partial<FeedLeaveInput> = {}): FeedLeaveInput {
  return {
    id: "l1",
    title: "여름 휴가",
    startDate: "2026-08-02",
    endDate: "2026-08-09",
    returnTime: "21:00",
    reason: null,
    status: "approved",
    segments: [
      {
        category: "annual",
        overnightKind: null,
        outingKind: null,
        startDate: "2026-08-02",
        endDate: "2026-08-05",
      },
      {
        category: "overnight",
        overnightKind: "regular",
        outingKind: null,
        startDate: "2026-08-06",
        endDate: "2026-08-09",
      },
    ],
    ...overrides,
  };
}

const empty = {
  leaves: [],
  personalEvents: [],
  unitEvents: [],
  unitName: null,
};

describe("buildFeedItems — 휴가", () => {
  it("휴가 한 건을 일정 하나로, 구간·상태·복귀·사유를 설명에 담는다", () => {
    const [item] = buildFeedItems({
      ...empty,
      leaves: [leave({ reason: "가족 행사" })],
    });
    expect(item).toEqual({
      uid: "leave-l1",
      title: "[휴가] 여름 휴가",
      description:
        "8/2~8/5 연가 · 8/6~8/9 정기외박\n상태: 확정\n복귀 21:00\n사유: 가족 행사",
      startDate: "2026-08-02",
      endDate: "2026-08-09",
      startTime: null,
      endTime: null,
    });
  });

  it("구간이 전부 외출이면 [외출], 전부 외박이면 [외박]", () => {
    const outing = leave({
      segments: [
        {
          category: "outing",
          overnightKind: null,
          outingKind: "weekend",
          startDate: "2026-08-02",
          endDate: "2026-08-02",
        },
      ],
    });
    const overnight = leave({
      id: "l2",
      segments: [
        {
          category: "overnight",
          overnightKind: "other",
          outingKind: null,
          startDate: "2026-08-02",
          endDate: "2026-08-03",
        },
      ],
    });
    const items = buildFeedItems({ ...empty, leaves: [outing, overnight] });
    expect(items.map((i) => i.title)).toEqual([
      "[외출] 여름 휴가",
      "[외박] 여름 휴가",
    ]);
    expect(items[0]!.description).toContain("8/2 주말 외출");
  });

  it("초안은 (초안)을 앞에 붙이고, 반려·취소는 내보내지 않는다", () => {
    const items = buildFeedItems({
      ...empty,
      leaves: [
        leave({ id: "d", status: "draft" }),
        leave({ id: "r", status: "rejected" }),
        leave({ id: "c", status: "cancelled" }),
      ],
    });
    expect(items.map((i) => i.uid)).toEqual(["leave-d"]);
    expect(items[0]!.title).toBe("(초안) [휴가] 여름 휴가");
  });
});

describe("buildFeedItems — 개인·부대 일정", () => {
  const base = {
    id: "e1",
    title: "면접",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    startTime: null,
    endTime: null,
  };

  it("개인 일정은 메모를 설명으로, 부대 일정은 그룹 이름을 제목 앞에", () => {
    const items = buildFeedItems({
      ...empty,
      personalEvents: [{ ...base, note: "정장" }],
      unitEvents: [{ ...base, id: "u1", title: "체육대회", details: "운동복" }],
      unitName: "3중대",
    });
    expect(items).toEqual([
      {
        uid: "personal-e1",
        title: "면접",
        description: "정장",
        startDate: "2026-10-01",
        endDate: "2026-10-01",
        startTime: null,
        endTime: null,
      },
      {
        uid: "unit-event-u1",
        title: "[3중대] 체육대회",
        description: "운동복",
        startDate: "2026-10-01",
        endDate: "2026-10-01",
        startTime: null,
        endTime: null,
      },
    ]);
  });

  it("시작·끝 시간이 있으면 시각 일정", () => {
    const [item] = buildFeedItems({
      ...empty,
      personalEvents: [
        {
          ...base,
          endDate: "2026-10-02",
          startTime: "09:00",
          endTime: "18:00",
          note: null,
        },
      ],
    });
    expect([item!.startTime, item!.endTime]).toEqual(["09:00", "18:00"]);
  });

  it("하루짜리에 시작 시간만 있으면 시각 일정, 끝은 없음", () => {
    const [item] = buildFeedItems({
      ...empty,
      personalEvents: [{ ...base, startTime: "09:00", note: null }],
    });
    expect([item!.startTime, item!.endTime, item!.description]).toEqual([
      "09:00",
      null,
      null,
    ]);
  });

  it("여러 날에 시작 시간만 있거나 끝 시간만 있으면 종일 + 설명 첫 줄에 시간", () => {
    const items = buildFeedItems({
      ...empty,
      personalEvents: [
        {
          ...base,
          id: "a",
          endDate: "2026-10-03",
          startTime: "09:00",
          note: "메모",
        },
        { ...base, id: "b", endTime: "18:00", note: null },
      ],
    });
    expect(items.map((i) => [i.startTime, i.endTime, i.description])).toEqual([
      [null, null, "09:00~\n메모"],
      [null, null, "~18:00"],
    ]);
  });
});

describe("buildFeedItems — 순서", () => {
  it("시작일, 그다음 uid 순으로 정렬해 매번 같은 출력을 낸다", () => {
    const items = buildFeedItems({
      ...empty,
      leaves: [
        leave({
          id: "b",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
          segments: [],
        }),
        leave({
          id: "a",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
          segments: [],
        }),
      ],
      personalEvents: [
        {
          id: "p",
          title: "x",
          startDate: "2026-08-01",
          endDate: "2026-08-01",
          startTime: null,
          endTime: null,
          note: null,
        },
      ],
    });
    expect(items.map((i) => i.uid)).toEqual([
      "personal-p",
      "leave-a",
      "leave-b",
    ]);
  });
});

describe("feedRangeStart", () => {
  it("6개월 전, 짧은 달은 말일로 접는다", () => {
    expect(feedRangeStart("2026-10-12")).toBe("2026-04-12");
    expect(feedRangeStart("2026-08-31")).toBe("2026-02-28");
  });
});

describe("구독 링크", () => {
  const url = "https://api.leave.moveto.kr/calendar/abc_DEF-123.ics";

  it("webcal 주소는 스킴만 바꾼다", () => {
    expect(calendarFeedWebcalUrl(url)).toBe(
      "webcal://api.leave.moveto.kr/calendar/abc_DEF-123.ics",
    );
  });

  it("구글 추가 주소는 webcal 주소를 cid로 인코딩해 싣는다", () => {
    expect(googleCalendarSubscribeUrl(url)).toBe(
      "https://calendar.google.com/calendar/r?cid=" +
        encodeURIComponent(
          "webcal://api.leave.moveto.kr/calendar/abc_DEF-123.ics",
        ),
    );
  });
});
