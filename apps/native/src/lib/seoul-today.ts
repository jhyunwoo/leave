/**
 * 한국시간 오늘 — 자정을 넘기면 스스로 바뀌는 값.
 *
 * 사용처: 달력 화면(screens/calendar)과 그 아래 격자.
 *
 * `todayInSeoul()`은 부르는 순간의 값이라, 렌더 중에 읽으면 **다시 렌더될 때까지
 * 그날에 머문다.** 앱을 켜 둔 채 자정을 넘기면 오늘 표시(칸의 진한 원)와 "오늘"
 * 버튼, 날짜 상세가 가리키는 달이 어제에 남는다. 화면을 껐다 켜면 앱이 앞으로
 * 돌아오며 재조회가 일어나 저절로 고쳐지므로 눈에 잘 띄지 않지만, 충전기에 꽂아
 * 두고 보는 상황에서는 그대로 남는다.
 *
 * 경계 계산은 `seoul-midnight.ts`에 순수 함수로 떼어 두고 여기서는 타이머만 건다 —
 * 자정을 실제로 넘겨 보지 않고도 그 판단을 테스트로 고정할 수 있어야 한다.
 */

import { todayInSeoul, type ISODate } from "@leave/shared/dates";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { msUntilNextSeoulMidnight } from "./seoul-midnight";

export { msUntilNextSeoulMidnight } from "./seoul-midnight";

/**
 * 타이머를 경계보다 조금 뒤에 건다. 몇 ms 일찍 깨면 아직 어제라 같은 값을 읽고,
 * 그 뒤로는 하루가 통째로 밀린다.
 */
const BOUNDARY_MARGIN_MS = 1_000;

/** 한국시간 오늘. 자정을 넘기거나 앱이 앞으로 돌아오면 스스로 갱신된다. */
export function useSeoulToday(): ISODate {
  const [today, setToday] = useState(todayInSeoul);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      // 같은 날짜면 React가 리렌더를 건너뛴다 — 재무장만 하고 지나간다.
      setToday(todayInSeoul());
      timer = setTimeout(
        arm,
        msUntilNextSeoulMidnight(Date.now()) + BOUNDARY_MARGIN_MS,
      );
    };
    arm();

    // 백그라운드에서는 타이머가 제때 깨지 않는다(Doze·앱 정지). 돌아오는 순간
    // 한 번 맞추고 다음 경계로 다시 건다.
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") return;
      if (timer) clearTimeout(timer);
      arm();
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
