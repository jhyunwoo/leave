/**
 * 복무 진행률의 시계 — 프레임 시계와 저속 시계, 그리고 둘을 켜고 끄는 게이트.
 * 사용처: components/service-progress.tsx(프로필 카드), screens/service-progress-detail.tsx(전체 화면).
 *
 * 값을 만드는 자리와 그리는 자리를 나눈 이유는, 같은 퍼센트를 두 화면이 서로 다른
 * 모양으로 그리기 때문이다. 카드는 한 줄 문장으로, 전체 화면은 큰 숫자 두 조각과
 * 막대 두 개로 쓴다. 시계를 각자 다시 적으면 아래의 앵커링 규칙이 두 벌이 된다.
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { percentBetween } from "./service-progress-format";

/** 요구 상한. 144Hz 안드로이드 기기에서도 이 이상은 그리지 않는다. */
const MAX_FPS = 120;
const DRAW_INTERVAL_MS = 1000 / MAX_FPS;
/** 막대와 접근성 값은 분 단위 갱신으로 충분하며 화면·배터리 노이즈를 만들지 않는다. */
const TICK_MS = 60_000;

/** 화면이 보이고 앱이 포그라운드일 때만 true. 시계와 프레임 콜백이 함께 쓴다. */
export function useActiveGate(): boolean {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    () => AppState.currentState === "active",
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return focused && foreground;
}

/** 막대와 접근성 값을 위한 저속 시계. */
export function useServiceTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    // 분 경계에 맞춰야 21:00 복귀가 21:00:37까지 남아 있는 식으로 늦지 않는다.
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, TICK_MS);
      },
      TICK_MS - (Date.now() % TICK_MS),
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [active]);

  return now;
}

/**
 * 매 프레임 갱신되는 퍼센트. UI 스레드에만 존재하므로 리렌더를 만들지 않는다.
 *
 * 시계는 프레임 타임스탬프(iOS CACurrentMediaTime, Android nanoTime)를 쓴다.
 * Date.now()는 1ms 격자라 10번째 자리가 21씩 뭉텅이로 튀는데, 활성화 첫 프레임에
 * 벽시계와 프레임 시계를 한 번 맞춰두면 그 뒤로는 서브밀리초로 흐른다.
 */
export function useServicePercentClock(
  start: number,
  span: number,
  active: boolean,
  initialNow: number,
): SharedValue<number> {
  const percent = useSharedValue(percentBetween(start, span, initialNow));
  const epochAnchor = useSharedValue(0);
  const frameAnchor = useSharedValue(0);
  const nextDue = useSharedValue(0);

  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    // timeSinceFirstFrame은 활성화될 때마다 0부터 다시 시작한다. 그 첫 프레임에서
    // 벽시계와 프레임 시계를 맞춰두면 백그라운드 동안 벌어진 차이가 흡수된다.
    if (frame.timeSinceFirstFrame === 0) {
      epochAnchor.value = Date.now();
      frameAnchor.value = frame.timestamp;
      nextDue.value = frame.timestamp;
    } else if (frame.timestamp < nextDue.value) {
      return;
    }
    // 다음 차례는 "그린 시각"이 아니라 "예정 시각"에서 더한다. 그래야 144Hz에서
    // 한 프레임씩 거르며 72fps로 반토막 나지 않고 120fps에 붙는다.
    const due = nextDue.value + DRAW_INTERVAL_MS;
    nextDue.value =
      due < frame.timestamp ? frame.timestamp + DRAW_INTERVAL_MS : due;

    const now = epochAnchor.value + (frame.timestamp - frameAnchor.value);
    percent.value = percentBetween(start, span, now);
  }, false);

  useEffect(() => {
    frameCallback.setActive(active);
    return () => frameCallback.setActive(false);
  }, [active, frameCallback]);

  return percent;
}
