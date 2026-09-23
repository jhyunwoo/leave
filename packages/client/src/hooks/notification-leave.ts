import { useState } from "react";
import { addDays, ApiError } from "@leave/shared";
import type { NotificationList } from "../types";
import { useFriendSchedule } from "./friends";
import { useMyLeaves } from "./leaves";

export type FriendLeaveNotification = NonNullable<
  NotificationList["notifications"][number]["friendLeave"]
>;

/** 친구 일정은 열 때마다 현재 권한으로 조회하고, 내 비공개 계획은 내 목록에서 비교한다. */
export function useNotificationLeaveDetails(
  target: FriendLeaveNotification,
  initialDate?: string,
) {
  const [date, setDate] = useState(initialDate ?? target.startDate);
  const friend = useFriendSchedule(
    target.userId,
    target.startDate,
    target.endDate,
  );
  const mine = useMyLeaves();
  const loading = friend.isPending || friend.isFetching || mine.isPending;
  const error = friend.error ?? mine.error;
  const message = error
    ? error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
      ? "친구 관계가 변경되어 이 일정을 볼 수 없어요."
      : "일정을 불러오지 못했어요. 다시 시도해주세요."
    : loading
      ? null
      : friend.data?.people[0]?.leaveScheduleShared === false
        ? "친구가 휴가 일정을 공유하지 않아요."
        : !friend.data?.leaves.some((leave) => leave.leaveId === target.leaveId)
          ? "이 휴가는 삭제되었거나 기간 또는 공유 상태가 변경되었어요."
          : null;
  return {
    date,
    previous: () => setDate(addDays(date, -1)),
    next: () => setDate(addDays(date, 1)),
    canPrevious: date > target.startDate,
    canNext: date < target.endDate,
    loading,
    message,
    retry: () => Promise.all([friend.refetch(), mine.refetch()]),
    friendName: friend.data?.people[0]?.name ?? "친구",
    friendLeaves:
      friend.data?.leaves.filter(
        (leave) => leave.startDate <= date && date <= leave.endDate,
      ) ?? [],
    myLeaves:
      mine.data?.leaves.filter(
        (leave) => leave.startDate <= date && date <= leave.endDate,
      ) ?? [],
  };
}
