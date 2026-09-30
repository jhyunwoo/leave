/**
 * 부대가 없는 사람의 날짜 상세 명단.
 *
 * 부대 달력이 없어도 날짜 상세가 내 휴가를 보여줘야 한다. 무엇을 넣고 빼는지가
 * 잔여 계산과 어긋나면 "달력에는 있는데 명단에는 없다"가 된다.
 */

import { describe, expect, it } from "vitest";
import { soloDayRoster } from "../src/solo-day-roster";
import type { MyLeave } from "../src/types";

function leave(values: Partial<MyLeave> & { id: string }): MyLeave {
  return {
    title: "연가",
    startDate: "2026-10-05",
    endDate: "2026-10-07",
    returnTime: "21:00",
    reason: null,
    status: "shared",
    segments: [
      {
        category: "annual",
        startDate: "2026-10-05",
        endDate: "2026-10-07",
      },
    ],
    ...values,
  } as MyLeave;
}

const me = { id: "me", name: "나본인" };

describe("soloDayRoster", () => {
  it("내 휴가를 내 이름의 명단 행으로 옮긴다", () => {
    const [row] = soloDayRoster([leave({ id: "a" })], me);
    expect(row).toMatchObject({
      leaveId: "a",
      userId: "me",
      name: "나본인",
      startDate: "2026-10-05",
      endDate: "2026-10-07",
      status: "shared",
    });
  });

  it("초안은 넣고 반려·취소는 뺀다", () => {
    const rows = soloDayRoster(
      [
        leave({ id: "draft", status: "draft" }),
        leave({ id: "rejected", status: "rejected" }),
        leave({ id: "cancelled", status: "cancelled" }),
        leave({ id: "approved", status: "approved" }),
      ],
      me,
    );
    expect(rows.map((row) => row.leaveId)).toEqual(["draft", "approved"]);
  });

  it("내 정보를 아직 받지 못했으면 비워 둔다", () => {
    expect(soloDayRoster([leave({ id: "a" })], undefined)).toEqual([]);
    expect(soloDayRoster(undefined, me)).toEqual([]);
  });
});
