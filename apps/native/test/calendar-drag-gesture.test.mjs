import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { isUserEditableLeaveStatus } from "@leave/shared/leave";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 이 회귀는 TypeScript 원본에서는 발생하지 않는다. 실제 Expo 빌드의 Worklets
// 변환이 콜백마다 클로저 값을 복사하므로, 변환된 코드를 실행해야 잡을 수 있다.
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const presetPath = expoRequire.resolve("babel-preset-expo");
const { transformSync } = createRequire(presetPath)("@babel/core");
const filename = fileURLToPath(
  new URL(
    "../src/components/calendar-drag/use-leave-chip-drag.ts",
    import.meta.url,
  ),
);
const source = readFileSync(filename, "utf8");

function loadGesture({ transform = true, status = "shared" } = {}) {
  const begin = vi.fn();
  const context = { gesture: {}, begin };
  const callbacks = {};
  const pan = {};
  // 네이티브 인식기의 등록 경계만 대체한다. 앱 콜백과 Expo 변환은 실제 코드다.
  for (const method of [
    "enabled",
    "activateAfterLongPress",
    "runOnJS",
    "simultaneousWithExternalGesture",
    "blocksExternalGesture",
  ]) {
    pan[method] = (value) => {
      if (method === "enabled") pan.enabledValue = value;
      return pan;
    };
  }
  for (const method of ["onTouchesDown", "onStart", "onFinalize"]) {
    pan[method] = (callback) => {
      callbacks[method] = callback;
      return pan;
    };
  }
  const code = transform
    ? transformSync(source, {
        filename,
        configFile: false,
        babelrc: false,
        presets: [presetPath],
      }).code
    : ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    global: { Error },
    require(name) {
      if (name === "react")
        return { useContext: () => context, useMemo: (fn) => fn() };
      if (name === "react-native-gesture-handler")
        return { Gesture: { Pan: () => pan } };
      if (name === "./context") return { CalendarDragContext: {} };
      if (name === "@leave/shared/leave") return { isUserEditableLeaveStatus };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  exports.useLeaveChipDrag({
    leaveId: "leave-1",
    status,
    date: "2026-09-07",
    scrollGesture: {},
  });
  return { callbacks, begin, pan };
}

describe("달력 길게 누르기 — Expo Worklets 빌드", () => {
  it("Worklets 변환 없이 실행하면 같은 터치로 선택을 시작한다", () => {
    const { callbacks, begin, pan } = loadGesture({ transform: false });
    expect(pan.enabledValue).toBe(true);
    const touch = { id: 0, absoluteX: 180, absoluteY: 400 };
    callbacks.onTouchesDown({ changedTouches: [touch] });
    callbacks.onStart();
    expect(begin).toHaveBeenCalledExactlyOnceWith(
      "leave-1",
      "2026-09-07",
      touch,
    );
  });

  it("빌드된 콜백이 실제 눌린 손가락으로 휴가 선택을 시작한다", () => {
    const { callbacks, begin } = loadGesture();
    const touch = { id: 0, absoluteX: 180, absoluteY: 400 };
    callbacks.onTouchesDown({ changedTouches: [touch] });
    callbacks.onStart();
    expect(begin).toHaveBeenCalledExactlyOnceWith(
      "leave-1",
      "2026-09-07",
      touch,
    );
  });

  it("두 번째 손가락이 들어와도 처음 잡은 손가락을 유지한다", () => {
    const { callbacks, begin } = loadGesture();
    const touch = { id: 3, absoluteX: 180, absoluteY: 400 };
    callbacks.onTouchesDown({ changedTouches: [touch] });
    callbacks.onTouchesDown({
      changedTouches: [{ id: 9, absoluteX: 50, absoluteY: 600 }],
    });
    callbacks.onStart();
    expect(begin).toHaveBeenCalledExactlyOnceWith(
      "leave-1",
      "2026-09-07",
      touch,
    );
  });

  it("다음 길게 누르기에는 이전 터치 대신 새 손가락을 사용한다", () => {
    const { callbacks, begin } = loadGesture();
    callbacks.onTouchesDown({
      changedTouches: [{ id: 0, absoluteX: 180, absoluteY: 400 }],
    });
    callbacks.onStart();
    callbacks.onFinalize();
    const next = { id: 4, absoluteX: 200, absoluteY: 420 };
    callbacks.onTouchesDown({ changedTouches: [next] });
    callbacks.onStart();
    expect(begin).toHaveBeenLastCalledWith("leave-1", "2026-09-07", next);
    expect(begin).toHaveBeenCalledTimes(2);
  });
});
