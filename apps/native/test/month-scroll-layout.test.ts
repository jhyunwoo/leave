import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as monthWindow from "../src/components/month-window";

// 네이티브 목록 경계만 대체하고 실제 훅의 스크롤·레이아웃 콜백을 실행한다.
function harness() {
  const slots: unknown[] = [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const frames = new Map<number, () => void>();
  let frameId = 0;
  const react = {
    useRef(value: unknown) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useState(initial: () => unknown) {
      const index = cursor++;
      slots[index] ??= initial();
      return [
        slots[index],
        (value: unknown) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useCallback: (fn: unknown) => fn,
    useEffect(fn: () => (() => void) | undefined, deps: unknown[]) {
      const index = cursor++;
      const previous = slots[index] as
        { deps: unknown[]; cleanup?: () => void } | undefined;
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i])))
        return;
      previous?.cleanup?.();
      effects.push(() => {
        slots[index] = { deps, cleanup: fn() };
      });
    },
  };
  const exports: {
    useMonthScrollWindow?: (options: {
      itemHeight: number;
      currentMonth: string;
    }) => import("../src/components/month-scroll-window").MonthScrollWindow;
  } = {};
  const source = readFileSync(
    new URL("../src/components/month-scroll-window.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require: (name: string) =>
        name === "react"
          ? react
          : name === "expo-haptics"
            ? { selectionAsync: vi.fn() }
            : monthWindow,
      requestAnimationFrame: (fn: () => void) => {
        frames.set(++frameId, fn);
        return frameId;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      process: { env: {} },
    },
  );
  const scrollToOffset = vi.fn();
  return {
    scrollToOffset,
    render(itemHeight: number) {
      cursor = 0;
      const result = exports.useMonthScrollWindow!({
        itemHeight,
        currentMonth: "2026-09",
      });
      result.listRef.current = {
        scrollToOffset,
      } as unknown as typeof result.listRef.current;
      effects.splice(0).forEach((effect) => effect());
      return result;
    },
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn());
    },
  };
}

it("관성 종료 이벤트 없이 편집 시트가 열려 높이가 바뀌어도 보던 월을 유지한다", () => {
  const h = harness();
  const calendar = h.render(600);
  calendar.onScroll({
    nativeEvent: { contentOffset: { y: 1800 } },
  } as Parameters<typeof calendar.onScroll>[0]);
  h.render(700);
  h.flush();
  expect(h.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 2100,
    animated: false,
  });
});

it("범위 밖 저장 월 이동과 레이아웃 변경이 겹쳐도 예약한 월 이동을 잃지 않는다", () => {
  const h = harness();
  h.render(600).scrollToMonth("2027-03");
  h.render(600);
  h.render(700);
  h.flush();
  expect(h.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 1400,
    animated: false,
  });
});

it("저장 후에는 애니메이션 중간 달을 거치지 않고 새 월에 자리 잡는다", () => {
  const h = harness();
  h.render(600).scrollToMonth("2026-11", false);
  expect(h.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 2400,
    animated: false,
  });
  h.render(700);
  h.flush();
  expect(h.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 2800,
    animated: false,
  });
});

it("새 월 목록을 그리는 중 다음 달이 추가되어도 저장 월로의 예약 이동을 유지한다", () => {
  const h = harness();
  h.render(600).scrollToMonth("2027-03");
  h.render(600).onEndReached();
  h.render(600);
  h.flush();
  expect(h.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 1200,
    animated: false,
  });
});
