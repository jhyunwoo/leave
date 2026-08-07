/**
 * 캐시 무효화 헬퍼.
 *
 * "이 뮤테이션이 성공하면 무엇이 낡는가"를 뮤테이션마다 손으로 적으면 화면이
 * 늘어날수록 빠뜨리기 쉽다. 여기서 무효화 묶음을 이름으로 정의하고 훅에서
 * 재사용한다.
 */
import { useQueryClient } from "@tanstack/react-query";
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
 * 휴가를 등록·수정·삭제했을 때 함께 낡는 캐시들.
 * 달력 집계·내 휴가 목록·알림함은 물론, 재원 잔여와 적립분 사용량까지 바뀐다.
 */
export const LEAVE_MUTATION_KEYS = [
  queryKeys.calendars,
  queryKeys.myLeaves,
  queryKeys.notifications,
  queryKeys.leaveBalances,
  queryKeys.leaveGrants,
] as const;

/** 적립분을 바꾸면 재원 총량도 달라지므로 두 캐시를 함께 비운다. */
export const GRANT_MUTATION_KEYS = [
  queryKeys.leaveGrants,
  queryKeys.leaveBalances,
] as const;

/** 제한 기간을 바꾸면 달력의 표시가 함께 바뀐다. */
export const BLACKOUT_MUTATION_KEYS = [
  queryKeys.allBlackouts,
  queryKeys.calendars,
] as const;
