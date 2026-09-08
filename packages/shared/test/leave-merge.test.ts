/**
 * 붙어 있는 휴가를 한 건으로 합치는 규칙.
 *
 * 여기서 지켜야 하는 것은 두 가지다. (1) 재원이 다른 구간은 절대 합치지 않는다 —
 * 연가 3일 + 정기외박 4일은 합친 뒤에도 연가 3일 + 정기외박 4일이어야 한다.
 * (2) 사용자가 직접 붙인 이름을 자동 제목이 덮지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  planLeaveMerge,
  type LeaveSegment,
  type MergeCandidate,
} from "../src/index";

function seg(
  category: LeaveSegment["category"],
  startDate: string,
  endDate: string,
  overnightKind?: LeaveSegment["overnightKind"],
): LeaveSegment {
  const days =
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000 +
    1;
  return { category, overnightKind, startDate, endDate, days };
}

function leave(
  id: string,
  segments: LeaveSegment[],
  extra: Partial<Omit<MergeCandidate, "id" | "segments">> = {},
): MergeCandidate {
  return {
    id,
    title: "연가 계획",
    reason: null,
    status: "shared",
    createdAt: `2026-01-01T00:00:0${id.length % 10}.000Z`,
    segments,
    ...extra,
  };
}

describe("planLeaveMerge — 붙음/겹침/상태", () => {
  it("이웃이 없으면 alone이다", () => {
    const plan = planLeaveMerge(
      leave("a", [seg("annual", "2026-02-03", "2026-02-05")]),
      [],
    );
    expect(plan.kind).toBe("alone");
  });

  it("앞 휴가 끝 다음 날에 시작하면 합친다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.hostId).toBe("a");
    expect(plan.absorbedIds).toEqual(["b"]);
  });

  it("합쳐진 휴가의 복귀 시간은 가장 늦게 끝나는 일정 것을 따른다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      returnTime: "18:00",
    });
    const after = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      returnTime: "20:30",
    });
    const plan = planLeaveMerge(before, [after]);
    expect(plan).toMatchObject({ kind: "merged", returnTime: "20:30" });
  });

  it("하루라도 비면 합치지 않는다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-07", "2026-02-09")]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });

  it("겹치면 conflict와 겹치기 시작한 날짜를 돌려준다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-07")]);
    const incoming = leave("b", [seg("annual", "2026-02-05", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("conflict");
    if (plan.kind !== "conflict") return;
    expect(plan.overlapStart).toBe("2026-02-05");
    expect(plan.conflictWith.id).toBe("a");
  });

  it("겹침은 붙은 이웃이 있어도 먼저 알린다", () => {
    const touching = leave("a", [seg("annual", "2026-02-01", "2026-02-02")]);
    const overlapping = leave("c", [seg("annual", "2026-02-04", "2026-02-06")]);
    const incoming = leave("b", [seg("annual", "2026-02-03", "2026-02-05")]);
    expect(planLeaveMerge(incoming, [touching, overlapping]).kind).toBe(
      "conflict",
    );
  });

  it("상태가 다르면 붙어 있어도 손대지 않는다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      status: "draft",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });

  it("상태가 다르면 겹쳐도 오류가 아니다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-07")], {
      status: "draft",
    });
    const incoming = leave("b", [seg("annual", "2026-02-05", "2026-02-09")]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });

  it("앞뒤 양쪽에 붙으면 셋이 하나가 된다", () => {
    const before = leave("a", [seg("annual", "2026-02-01", "2026-02-02")]);
    const after = leave("c", [seg("annual", "2026-02-10", "2026-02-12")]);
    const incoming = leave("b", [seg("annual", "2026-02-03", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before, after]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.hostId).toBe("a");
    expect(plan.absorbedIds.sort()).toEqual(["b", "c"]);
    expect(plan.segments).toEqual([
      {
        category: "annual",
        overnightKind: undefined,
        startDate: "2026-02-01",
        endDate: "2026-02-12",
        days: 12,
      },
    ]);
  });

  it("한 홉 건너 붙어 있는 기존 데이터도 연쇄로 흡수한다", () => {
    // a(2/1~2/2) — b(2/3~2/5) 는 이미 붙은 채 저장돼 있고, 새로 c(2/6~2/9)가 온다.
    const a = leave("a", [seg("annual", "2026-02-01", "2026-02-02")]);
    const b = leave("b", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("c", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [a, b]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.hostId).toBe("a");
    expect(plan.absorbedIds.sort()).toEqual(["b", "c"]);
  });
});

describe("planLeaveMerge — 구간과 일수 보존", () => {
  it("재원이 다르면 구간을 따로 남기고 일수를 유지한다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [
      seg("overnight", "2026-02-06", "2026-02-09", "regular"),
    ]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.segments).toEqual([
      {
        category: "annual",
        overnightKind: undefined,
        startDate: "2026-02-03",
        endDate: "2026-02-05",
        days: 3,
      },
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-02-06",
        endDate: "2026-02-09",
        days: 4,
      },
    ]);
  });

  it("같은 재원이 연달아 오면 한 구간으로 잇고 일수 합이 같다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]!.days).toBe(7);
  });

  it("외박은 종류가 다르면 따로 남는다", () => {
    const before = leave("a", [
      seg("overnight", "2026-02-03", "2026-02-04", "regular"),
    ]);
    const incoming = leave("b", [
      seg("overnight", "2026-02-05", "2026-02-06", "other"),
    ]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.segments).toHaveLength(2);
  });

  it("30구간을 넘기면 병합을 포기한다", () => {
    // 재원을 번갈아 두면 합쳐지지 않으므로 구간 수가 그대로 쌓인다.
    const many: LeaveSegment[] = [];
    for (let i = 0; i < 29; i += 1) {
      const day = `2026-03-${String(i + 1).padStart(2, "0")}`;
      many.push(seg(i % 2 === 0 ? "annual" : "award", day, day));
    }
    const before = leave("a", many);
    const incoming = leave("b", [
      seg("award", "2026-03-30", "2026-03-30"),
      seg("annual", "2026-03-31", "2026-03-31"),
    ]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });
});

describe("planLeaveMerge — 제목·사유·살아남는 행", () => {
  it("직접 지은 이름이 하나면 그것을 쓴다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      title: "제주도 가족여행",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.title).toBe("제주도 가족여행");
  });

  it("직접 지은 이름이 여럿이면 시작일이 이른 쪽을 쓴다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      title: "본가",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      title: "제주도 가족여행",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.title).toBe("본가");
  });

  it("전부 자동 제목이면 합친 첫 구간으로 다시 짓는다", () => {
    const before = leave(
      "a",
      [seg("overnight", "2026-02-03", "2026-02-05", "regular")],
      {
        title: "정기외박 계획",
      },
    );
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      title: "연가 계획",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.title).toBe("정기외박 계획");
  });

  it("사유를 시작일 순으로 줄바꿈해 잇고 중복은 한 번만 넣는다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      reason: "본가 방문",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      reason: "가족 행사",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.reason).toBe("본가 방문\n가족 행사");

    const same = planLeaveMerge(
      leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
        reason: "본가 방문",
      }),
      [before],
    );
    if (same.kind !== "merged") throw new Error("merged가 아니다");
    expect(same.reason).toBe("본가 방문");
  });

  it("사유가 둘 다 없으면 null이다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.reason).toBeNull();
  });

  it("사유가 500자를 넘으면 자른다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      reason: "가".repeat(400),
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      reason: "나".repeat(400),
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.reason).toHaveLength(500);
  });

  it("살아남는 행의 id와 createdAt은 시작일이 이른 쪽이다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.hostId).toBe("a");
    expect(plan.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("새 휴가가 앞에 오면 새 휴가가 살아남는다", () => {
    const after = leave("a", [seg("annual", "2026-02-06", "2026-02-09")]);
    const incoming = leave("b", [seg("annual", "2026-02-03", "2026-02-05")]);
    const plan = planLeaveMerge(incoming, [after]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.hostId).toBe("b");
    expect(plan.absorbedIds).toEqual(["a"]);
  });

  it("others에 자기 자신이 섞여 와도 무시한다", () => {
    const incoming = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    expect(planLeaveMerge(incoming, [incoming]).kind).toBe("alone");
  });
});
