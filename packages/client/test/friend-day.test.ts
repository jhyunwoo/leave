/**
 * 친구 달력에서 고른 하루를 정리하는 규칙.
 *
 * 달을 넘겨 걸친 휴가의 "며칠째"와, 같은 사람이 한 날에 두 건을 가진 경우가 미묘하다.
 * 웹·네이티브의 상세 패널과 격자가 같은 답을 봐야 한다.
 */

import { describe, expect, it } from "vitest";
import { friendDayLeaves, friendDayPeople } from "../src/friend-day";
import type { FriendCalendar, FriendCalendarLeave } from "../src/types";

function leave(
  values: Partial<FriendCalendarLeave> & { leaveId: string; userId: string },
): FriendCalendarLeave {
  return {
    startDate: "2026-09-18",
    endDate: "2026-09-18",
    status: "shared",
    kind: "leave",
    ...values,
  };
}

function calendar(leaves: FriendCalendarLeave[]): FriendCalendar {
  return {
    month: "2026-09",
    people: [
      {
        userId: "me",
        name: "나본인",
        username: null,
        isViewer: true,
        leaveScheduleShared: true,
      },
      {
        userId: "b",
        name: "김하나",
        username: null,
        isViewer: false,
        leaveScheduleShared: true,
      },
      {
        userId: "a",
        name: "박두울",
        username: null,
        isViewer: false,
        leaveScheduleShared: true,
      },
    ],
    leaves,
  };
}

describe("friendDayLeaves", () => {
  it("그날에 걸치지 않는 휴가는 빠진다", () => {
    const rows = friendDayLeaves(
      calendar([
        leave({
          leaveId: "l1",
          userId: "a",
          startDate: "2026-09-01",
          endDate: "2026-09-03",
        }),
        leave({
          leaveId: "l2",
          userId: "a",
          startDate: "2026-09-17",
          endDate: "2026-09-19",
        }),
      ]),
      "2026-09-18",
    );
    expect(rows.map((row) => row.leaveId)).toEqual(["l2"]);
  });

  it("내 줄이 먼저, 그 다음은 이름순이다", () => {
    const rows = friendDayLeaves(
      calendar([
        leave({ leaveId: "l1", userId: "a" }),
        leave({ leaveId: "l2", userId: "b" }),
        leave({ leaveId: "l3", userId: "me" }),
      ]),
      "2026-09-18",
    );
    expect(rows.map((row) => row.userId)).toEqual(["me", "b", "a"]);
    expect(rows[0]!.isViewer).toBe(true);
    expect(rows[1]!.name).toBe("김하나");
  });

  // 달·해를 넘겨 걸친 휴가도 "5일 중 3일째"가 맞아야 한다.
  it("달 경계를 넘긴 휴가의 일수와 몇 일째를 센다", () => {
    const [row] = friendDayLeaves(
      calendar([
        leave({
          leaveId: "l1",
          userId: "a",
          startDate: "2025-12-30",
          endDate: "2026-01-03",
        }),
      ]),
      "2026-01-01",
    );
    expect(row).toMatchObject({
      totalDays: 5,
      dayIndex: 3,
      isFirstDay: false,
      isLastDay: false,
    });
  });

  it("첫날과 마지막 날을 가려낸다", () => {
    const rows = friendDayLeaves(
      calendar([
        leave({
          leaveId: "l1",
          userId: "a",
          startDate: "2026-09-18",
          endDate: "2026-09-20",
        }),
        leave({
          leaveId: "l2",
          userId: "b",
          startDate: "2026-09-16",
          endDate: "2026-09-18",
        }),
      ]),
      "2026-09-18",
    );
    expect(rows.map((row) => [row.isFirstDay, row.isLastDay])).toEqual([
      [false, true],
      [true, false],
    ]);
  });

  it("갈래가 없는 옛 응답은 휴가로 읽는다", () => {
    const [row] = friendDayLeaves(
      calendar([
        {
          leaveId: "l1",
          userId: "a",
          startDate: "2026-09-18",
          endDate: "2026-09-18",
          status: "shared",
        } as FriendCalendarLeave,
      ]),
      "2026-09-18",
    );
    expect(row!.kind).toBe("leave");
  });

  it("달력이 아직 없으면 빈 목록이다", () => {
    expect(friendDayLeaves(undefined, "2026-09-18")).toEqual([]);
  });
});

describe("friendDayPeople", () => {
  it("사람마다 한 번만, 외출은 외출로 표시한다", () => {
    expect(
      friendDayPeople(
        [
          leave({ leaveId: "l1", userId: "a", kind: "outing" }),
          leave({ leaveId: "l2", userId: "b" }),
        ],
        "2026-09-18",
      ),
    ).toEqual([
      { userId: "a", kind: "outing" },
      { userId: "b", kind: "leave" },
    ]);
  });

  // 같은 날 외출과 휴가를 함께 가진 사람은 휴가로 친다 — 순서에 좌우되면 안 된다.
  it("한 사람이 외출과 휴가를 함께 가지면 휴가로 친다", () => {
    const both = [
      leave({ leaveId: "l1", userId: "a", kind: "outing" }),
      leave({
        leaveId: "l2",
        userId: "a",
        startDate: "2026-09-16",
        endDate: "2026-09-19",
      }),
    ];
    expect(friendDayPeople(both, "2026-09-18")).toEqual([
      { userId: "a", kind: "leave" },
    ]);
    expect(friendDayPeople([...both].reverse(), "2026-09-18")).toEqual([
      { userId: "a", kind: "leave" },
    ]);
  });

  it("그날에 걸치지 않는 휴가는 세지 않는다", () => {
    expect(
      friendDayPeople(
        [
          leave({
            leaveId: "l1",
            userId: "a",
            startDate: "2026-09-19",
            endDate: "2026-09-19",
          }),
        ],
        "2026-09-18",
      ),
    ).toEqual([]);
  });
});
