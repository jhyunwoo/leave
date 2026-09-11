/**
 * 신고·차단 훅 (앱스토어 UGC 정책 대응).
 *
 * 사용처: 구성원 목록의 액션 메뉴, 휴가 상세의 신고 버튼.
 */
import type { BlockCreateInput, ReportCreateInput } from "@leave/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import { purgeFriendCalendarAccess } from "./friends";
import type { Calendar, Member } from "../types";

/** 신고는 접수만 하면 되므로 캐시를 건드리지 않는다. */
export function useCreateReport() {
  const { client, unwrap } = useLeaveApi();
  return useMutation({
    mutationFn: async (input: ReportCreateInput) =>
      unwrap(await client.moderation.reports.$post({ json: input })),
  });
}

/**
 * 사용자를 차단한다. 차단하면 그 사람의 콘텐츠가 목록에서 빠지므로
 * (그룹이 여러 개일 수 있으니) 구성원 목록 전체를 다시 받는다.
 */
export function useBlockUser() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlockCreateInput) =>
      unwrap(await client.moderation.blocks.$post({ json: input })),
    onSuccess: async (_data, input) => {
      await purgeFriendCalendarAccess(queryClient, input.userId);
      // A GET that started before the block can otherwise restore the person
      // immediately after this local filter. Stop both families first, then
      // apply exactly the server-side visibility rule without refetching every
      // mounted calendar month.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.allUnitMembers }),
        queryClient.cancelQueries({ queryKey: queryKeys.calendars }),
        queryClient.invalidateQueries({ queryKey: queryKeys.friends }),
      ]);
      queryClient.setQueriesData<{ members: Member[] }>(
        { queryKey: queryKeys.allUnitMembers },
        (current) => {
          if (!current) return current;
          const members = current.members.filter(
            (member) => member.id !== input.userId,
          );
          return members.length === current.members.length
            ? current
            : { ...current, members };
        },
      );
      queryClient.setQueriesData<Calendar>(
        { queryKey: queryKeys.calendars },
        (current) => {
          if (!current) return current;
          const attendees = current.attendees.filter(
            (attendee) => attendee.userId !== input.userId,
          );
          return attendees.length === current.attendees.length
            ? current
            : { ...current, attendees };
        },
      );
      // **여기서 달력을 무효화하지 않는 것은 의도다.** 위 패치가 곧 서버 규칙이라
      // (`lib/calendar.ts`: 차단은 명단에서만 숨기고 days 집계는 그대로 둔다)
      // 로컬 상태와 서버 응답이 갈리지 않는다. 무효화하면 붙어 있는 달 전부가 다시
      // 나가는데, 돌아오는 값은 방금 만든 것과 같다. 회귀 감시는
      // `test/cache-updates.test.tsx`의 "without refetching"이다 — 그 단정이
      // 이 판단을 지키고 있으니, 고치려면 그 테스트부터 다시 생각할 것.
    },
  });
}
