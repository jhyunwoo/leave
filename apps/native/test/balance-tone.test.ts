import { BALANCE_KEYS, type BalanceKey } from "@leave/shared";
import { describe, expect, it } from "vitest";
import {
  balanceTone,
  type BalancePalette,
  type BalanceTone,
} from "../src/balance-tone";

/** theme.ts의 팔레트와 같은 모양. 색값 자체는 이 판단과 무관하다. */
const palette = Object.fromEntries(
  BALANCE_KEYS.map((key) => [key, { fg: `fg-${key}`, bg: `bg-${key}` }]),
) as unknown as BalancePalette;

describe("balanceTone", () => {
  it.each(BALANCE_KEYS)("알고 있는 재원 %s은 제 색을 돌려준다", (key) => {
    expect(balanceTone(palette, key)).toEqual({
      fg: `fg-${key}`,
      bg: `bg-${key}`,
    });
  });

  /**
   * 서버가 먼저 배포되면 앱이 모르는 재원 이름이 응답에 실려 내려온다.
   * 그때 팔레트를 직접 색인하면 화면이 죽는다 — `balance-tone.ts` 머리주석 참고.
   */
  it("앱이 모르는 재원은 기타 색으로 접는다", () => {
    const future = "shore_leave" as BalanceKey;

    expect(balanceTone(palette, future)).toEqual(palette.other);
  });

  it("팔레트에서 칸이 빠져 있어도 undefined를 돌려주지 않는다", () => {
    const partial = { other: { fg: "fg", bg: "bg" } } as BalancePalette;

    const tone: BalanceTone = balanceTone(partial, "annual");

    expect(tone).toEqual({ fg: "fg", bg: "bg" });
  });
});
