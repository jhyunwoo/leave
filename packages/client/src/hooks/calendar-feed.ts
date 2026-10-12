/**
 * 외부 캘린더 구독 링크와 내보낼 일정.
 *
 * 사용처: 웹 프로필의 외부 캘린더 카드, 앱의 외부 캘린더 화면, 안드로이드 기기 캘린더 동기화.
 */
import type { FeedItem } from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import { setAuthoritativeQueryData } from "./invalidate";

type CalendarFeed = { url: string | null };

export function useCalendarFeed() {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.calendarFeed,
    queryFn: (context) =>
      adapter.client["calendar-feed"]
        .$get(
          undefined,
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<CalendarFeed>(response)),
  });
}

/** 만들기와 재발급은 같은 요청이다 — 서버가 토큰을 덮어쓴다. */
export function useEnableCalendarFeed() {
  const adapter = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      adapter.unwrap<{ url: string }>(
        await adapter.client["calendar-feed"].$post(),
      ),
    onSuccess: (data) =>
      setAuthoritativeQueryData<CalendarFeed>(
        queryClient,
        queryKeys.calendarFeed,
        { url: data.url },
      ),
  });
}

export function useDisableCalendarFeed() {
  const adapter = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      adapter.unwrap<{ ok: true }>(
        await adapter.client["calendar-feed"].$delete(),
      ),
    onSuccess: () =>
      setAuthoritativeQueryData<CalendarFeed>(
        queryClient,
        queryKeys.calendarFeed,
        { url: null },
      ),
  });
}

export function useCalendarFeedItems(enabled: boolean) {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.calendarFeedItems,
    enabled,
    queryFn: (context) =>
      adapter.client["calendar-feed"].items
        .$get(
          undefined,
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<{ items: FeedItem[] }>(response)),
  });
}
