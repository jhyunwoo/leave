/**
 * 달력 훅.
 *
 * 사용처: 웹 CalendarPage, 네이티브 캘린더 탭, 휴가 등록 폼(혼잡도 시뮬레이션).
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { Calendar, CalendarDay } from "../types";

/**
 * 달력 한 달은 전역 기본값(15초)보다 오래 신선하게 본다.
 *
 * 달력은 달마다 별도 쿼리이고, 무한 스크롤은 같은 달을 오르내리며 몇 번씩 다시
 * 마운트한다. 15초로는 위아래로 두 번 훑는 것만으로 같은 달을 다시 받는다 —
 * 저대역·간헐적 연결에서 가장 아픈 종류의 낭비다.
 *
 * 그렇다고 오래된 값을 보여주는 것도 아니다. 내 휴가를 등록·수정·삭제하면
 * `LEAVE_MUTATION_KEYS`가 달력 전체를 무효화하고, 남이 바꾼 것은 앱으로 돌아올 때
 * (focusManager) 와 재연결 시 다시 받는다.
 */
const CALENDAR_STALE_TIME = 60_000;

/** 한 달치 달력(일별 출타 통계 + 그 달에 걸친 휴가들). */
export function useCalendar(unitId: string | null, month: string) {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.calendar(unitId, month),
    enabled: unitId !== null,
    staleTime: CALENDAR_STALE_TIME,
    queryFn: async () =>
      unwrap<Calendar>(
        await client.units[":id"].calendar.$get({
          param: { id: unitId! },
          query: { month },
        }),
      ),
  });
}

/**
 * 여러 달의 달력을 한 번에 받아 일별 통계를 하나로 합친다.
 *
 * 대안 날짜 추천은 선택 구간 밖(±2주)까지 살펴보므로, 한 달치만 들고 계산하면
 * 월초·월말 후보가 "데이터 없음"으로 조용히 버려진다.
 *
 * 각 달은 `useCalendar`와 같은 캐시 키를 쓰므로, 달력 화면이 이미 받아둔 달은
 * 다시 요청하지 않는다.
 */
export function useCalendarDays(unitId: string | null, months: string[]) {
  const { client, unwrap } = useLeaveApi();
  return useQueries({
    queries: months.map((month) => ({
      queryKey: queryKeys.calendar(unitId, month),
      enabled: unitId !== null,
      staleTime: CALENDAR_STALE_TIME,
      queryFn: async () =>
        unwrap<Calendar>(
          await client.units[":id"].calendar.$get({
            param: { id: unitId! },
            query: { month },
          }),
        ),
    })),
    // combine은 결과가 실제로 바뀔 때만 다시 도는 React Query 내장 메모이제이션이다.
    // 바깥에서 useMemo로 감싸면 매 렌더 새 배열이 들어와 메모가 무력화된다.
    combine: (results) => {
      const byDate = new Map<string, CalendarDay>();
      for (const result of results) {
        for (const day of result.data?.days ?? []) byDate.set(day.date, day);
      }
      return {
        days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        isPending: results.some((result) => result.isPending),
      };
    },
  });
}
