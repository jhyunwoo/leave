import { API_URL, getAuthToken } from "@/api/client";
import { getLeaveWatch } from "../../modules/leave-watch";
import { captureHandledError } from "@/lib/observability";
import type { WatchPublishContext } from "./watch-publisher";
import type { WidgetTimelineEntry } from "./payload";

/**
 * 위젯이 받는 타임라인과 복무 날짜, 그리고 세션 토큰을 워치로 보낸다.
 * 토큰까지 넘기는 이유는 셀룰러 단독 모드 — 아이폰이 없을 때 워치가 직접
 * API를 불러 지표를 세야 한다. 워치 쪽은 토큰을 키체인에만 둔다.
 */
export function publishWatchTimeline(
  entries: WidgetTimelineEntry[],
  context?: WatchPublishContext,
): void {
  try {
    const token = getAuthToken();
    const envelope = {
      timeline: entries,
      service: context?.service ?? null,
      face: context?.face ?? null,
      // 토큰이 없을 때도 null로 보내야 워치가 저장된 토큰을 지운다.
      auth: token ? { apiUrl: API_URL, token } : null,
    };
    getLeaveWatch()?.publishWatchTimeline(JSON.stringify(envelope));
  } catch (error) {
    captureHandledError(error, { source: "home_widget" });
  }
}
