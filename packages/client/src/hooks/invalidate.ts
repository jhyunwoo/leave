/**
 * 캐시 무효화 헬퍼.
 *
 * "이 뮤테이션이 성공하면 무엇이 낡는가"를 뮤테이션마다 손으로 적으면 화면이
 * 늘어날수록 빠뜨리기 쉽다. 여기서 무효화 묶음을 이름으로 정의하고 훅에서
 * 재사용한다.
 */
import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { queryKeys } from "../query-keys";

/** 넘긴 키들을 한 번에 무효화하는 콜백을 만든다(뮤테이션 onSuccess용). */
export function useInvalidateKeys(keys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

/**
 * 서버가 완성된 최신 표현을 돌려준 쓰기는 진행 중이던 이전 GET을 먼저 버린 뒤
 * 그 응답을 캐시의 단일 출처로 삼는다. 전송 계층이 AbortSignal을 쓰지 않더라도
 * TanStack이 취소된 GET의 늦은 결과를 캐시에 반영하지 않는다.
 */
export async function setAuthoritativeQueryData<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: TData,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData(queryKey, data);
}

/**
 * 달력 캐시 중 실제로 날짜가 바뀐 달만 무효화한다.
 * `months`가 null이면 수정·삭제 전 범위를 찾지 못한 경우이므로 전체 달력으로
 * 보수적으로 되돌아간다.
 */
export function invalidateCalendarMonths(
  queryClient: QueryClient,
  months: ReadonlySet<string> | null,
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.calendars,
    predicate: (query) => {
      if (months === null) return true;
      const month = query.queryKey[2];
      return typeof month === "string" && months.has(month);
    },
  });
}

/**
 * 휴가를 등록·수정·삭제했을 때 함께 낡는 캐시들.
 * 내 휴가 목록은 물론, 재원 잔여와 적립분 사용량까지 바뀐다. 달력은 범위를
 * 아는 훅에서 `invalidateCalendarMonths`로 필요한 달만 따로 무효화한다.
 * 알림은 초과 날짜가 생긴 등록·수정에서만 추가되므로 mutation 응답을 보고
 * 해당 훅에서 조건부로 무효화한다. 삭제는 기존 알림을 지우지 않는다.
 */
export const LEAVE_MUTATION_KEYS = [
  queryKeys.myLeaves,
  queryKeys.leaveBalances,
  queryKeys.leaveGrants,
] as const;

/** 제한 기간을 바꾸면 달력의 표시가 함께 바뀐다. */
export const BLACKOUT_MUTATION_KEYS = [
  queryKeys.allBlackouts,
  queryKeys.calendars,
] as const;
