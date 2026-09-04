/**
 * 앱이 가진 값을 홈 화면 위젯으로 밀어 넣는다. 화면을 그리지 않는 컴포넌트다.
 *
 * 사용처: app/_layout.tsx의 RootNavigator. `ObservabilityLifecycle`과 같은 자리다.
 *
 * ## 왜 컴포넌트인가
 *
 * 위젯에 넣을 값은 로그인한 뒤에만 있는데, 훅은 조건부로 부를 수 없다. 인증
 * 상태에 따라 **컴포넌트를 갈아 끼우면** 로그아웃 상태에서 `/auth/me` 같은 요청이
 * 아예 나가지 않는다.
 *
 * ## 언제 밀어 넣는가
 *
 * 값이 실제로 달라졌을 때만(`timelineSignature`). 위젯을 다시 그리는 일은 공짜가
 * 아니고, 데이터가 그대로인 렌더마다 밀어 넣으면 그 비용만 쌓인다.
 *
 * 밀어 넣는 것은 한 순간의 값이 아니라 **앞으로 14일치 타임라인**이다. 그래서
 * 사용자가 앱을 켜지 않아도 D-Day는 매일 0시에 스스로 줄어든다. 자세한 배경은
 * payload.ts 머리주석에 있다.
 */

import { useMe, useMyDutyDays } from "@leave/client/hooks/auth";
import { useCalendar } from "@leave/client/hooks/calendar";
import { useLeaveBalances, useMyLeaves } from "@leave/client/hooks/leaves";
import { addDays, todayInSeoul } from "@leave/shared/dates";
import { useEffect, useMemo, useRef } from "react";
import { captureHandledError } from "@/lib/observability";
import { LeaveMetricWidget } from "./leave-metric.widget";
import { LeaveSummaryWidget } from "./leave-summary.widget";
import {
  buildWidgetTimeline,
  emptyWidgetProps,
  timelineSignature,
  TIMELINE_DAYS,
  type WidgetState,
  type WidgetTimelineEntry,
} from "./payload";
import { buildWidgetSource } from "./sources";
import { useWidgetPreferences } from "./use-widget-preferences";

/** 두 위젯은 같은 payload를 받는다 — 무엇을 고를지만 서로 다르다. */
function pushTimeline(entries: WidgetTimelineEntry[]): void {
  try {
    LeaveMetricWidget.updateTimeline(entries);
    LeaveSummaryWidget.updateTimeline(entries);
  } catch (error) {
    // 위젯이 없거나(구형 OS) 익스텐션이 아직 설치되지 않은 기기가 있다.
    // 홈 화면 장식 하나 때문에 앱이 멈추면 안 된다.
    captureHandledError(error, { source: "home_widget" });
  }
}

/** 인증 전·온보딩 전. 요청을 하나도 내지 않고 안내 문구만 남긴다. */
function PlaceholderWidgetSync({
  state,
}: {
  state: Exclude<WidgetState, "ready">;
}) {
  useEffect(() => {
    const now = new Date();
    pushTimeline([
      { date: now, props: emptyWidgetProps(state, todayInSeoul(now), now) },
    ]);
  }, [state]);
  return null;
}

function ReadyWidgetSync() {
  const me = useMe();
  const dutyDays = useMyDutyDays();
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const preferences = useWidgetPreferences();

  const today = todayInSeoul();
  const unitId = me.data?.unit?.id ?? null;
  // 창(오늘~13일 뒤)이 걸치는 달은 많아야 둘이다. 달력 화면과 캐시 키가 같아
  // 홈 탭을 한 번이라도 본 뒤라면 요청이 더 나가지 않는다.
  const firstMonth = today.slice(0, 7);
  const lastMonth = addDays(today, TIMELINE_DAYS - 1).slice(0, 7);
  const firstCalendar = useCalendar(unitId, firstMonth);
  const secondCalendar = useCalendar(
    unitId,
    lastMonth === firstMonth ? firstMonth : lastMonth,
  );

  const entries = useMemo(
    () =>
      buildWidgetTimeline(
        buildWidgetSource({
          state: "ready",
          today,
          me: me.data,
          dutyDays: dutyDays.data,
          leaves: leaves.data?.leaves,
          balances: balances.data,
          calendars: [firstCalendar.data, secondCalendar.data],
          preferences,
        }),
        new Date(),
      ),
    [
      today,
      me.data,
      dutyDays.data,
      leaves.data,
      balances.data,
      firstCalendar.data,
      secondCalendar.data,
      preferences,
    ],
  );

  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    // 내 정보가 아직 없으면 그릴 것이 없다. 빈 값을 밀어 넣으면 홈 화면의
    // 멀쩡한 위젯이 잠깐 "값 없음"으로 깜빡인다.
    if (!me.data) return;
    const signature = timelineSignature(entries);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    pushTimeline(entries);
  }, [entries, me.data]);

  return null;
}

export function WidgetSync({ state }: { state: WidgetState }) {
  if (state === "ready") return <ReadyWidgetSync />;
  return <PlaceholderWidgetSync state={state} />;
}
