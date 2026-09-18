import { describe, expect, it } from "vitest";
import {
  navigationTheme,
  type NavigationColors,
} from "../src/navigation-theme";
import type { Palette, Theme } from "../src/theme";

/**
 * theme.ts의 팔레트와 같은 모양. 색값 자체는 이 판단과 무관하므로 칸 이름을
 * 그대로 값으로 쓴다 — 어느 칸이 어느 자리로 갔는지가 보인다.
 */
const palette = new Proxy({} as Palette, {
  get: (_target, key) => `palette.${String(key)}`,
});

const themeOf = (scheme: Theme["scheme"]): Theme => ({
  scheme,
  colors: palette,
  balance: {} as Theme["balance"],
});

describe("navigationTheme", () => {
  it("스킴을 react-navigation의 dark 플래그로 옮긴다", () => {
    expect(navigationTheme(themeOf("dark")).dark).toBe(true);
    expect(navigationTheme(themeOf("light")).dark).toBe(false);
  });

  /**
   * 다크모드에서 개인 일정 시트 위쪽이 흰 띠로 남던 자리. 헤더 배경은 화면이
   * `headerStyle`을 비워 두면 이 `card`로 떨어진다 — expo-router의 기본 테마는
   * 라이트 고정이라 흰색이었다.
   */
  it("헤더 배경(card)을 팔레트의 canvas로 채운다", () => {
    expect(navigationTheme(themeOf("dark")).colors.card).toBe("palette.canvas");
  });

  /**
   * 한 칸이라도 비면 그 자리에 expo-router의 라이트 기본값이 그대로 남는다.
   * 새 색 이름이 생겼을 때 이 테스트가 먼저 알려준다.
   */
  it("react-navigation이 쓰는 색 칸을 하나도 비우지 않는다", () => {
    const names: (keyof NavigationColors)[] = [
      "primary",
      "background",
      "card",
      "text",
      "border",
      "notification",
    ];
    const { colors } = navigationTheme(themeOf("dark"));

    expect(Object.keys(colors).sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(colors[name]).toMatch(/^palette\./);
    }
  });
});
