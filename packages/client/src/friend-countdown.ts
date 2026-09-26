/**
 * 친구 카드의 두 D-day — 전역까지, 다음 휴가까지.
 *
 * 사용처: 웹 친구 화면(`FriendsPage`), 네이티브 친구 탭(`screens/friends.tsx`).
 *
 * 두 화면이 같은 말을 해야 해서 표기까지 여기서 정한다. 특히 null은 "없음"이
 * 아니라 친구가 공유하지 않은 것이다 — 빈칸으로 두면 "전역일이 없다"거나
 * "휴가가 없다"로 읽힌다. 공유는 했지만 잡힌 휴가가 없는 경우와도 말을 가른다.
 *
 * 다음 휴가는 서버가 외출을 빼고 골라 준다(`GET /friends`의 `nextLeave`).
 * 이미 나가 있으면 시작일은 지난 날이므로 복귀일까지 센다 — 내 휴가 카드
 * (`nextLeaveCountdown`)와 같은 규칙이다.
 */
// 배럴(`@leave/shared`)은 zod 스키마까지 평가시킨다 — next-leave-countdown.ts 참고.
import { diffDays, type ISODate } from "@leave/shared/dates";
import type { Friend } from "./types";

export type FriendDday = {
  label: string;
  /** 눈으로 읽는 값. "D-12", "비공개". */
  value: string;
  /** 스크린리더가 읽을 문장. "D-12"를 그대로 읽으면 뜻이 사라진다. */
  spoken: string;
  /** 숫자가 아니라 상태(비공개·없음·전역)다. 화면은 흐리게 그린다. */
  muted: boolean;
};

/** D-0은 "0일 남았다"로 읽힌다. 그 하루는 이름을 따로 준다(위젯과 같은 표기). */
function dday(days: number): string {
  return days === 0 ? "D-DAY" : `D-${days}`;
}

export function friendDischargeDday(
  friend: Pick<Friend, "dischargeAt">,
  today: ISODate,
): FriendDday {
  const label = "전역";
  if (friend.dischargeAt === null) {
    return { label, value: "비공개", spoken: "전역일 비공개", muted: true };
  }
  const days = diffDays(today, friend.dischargeAt);
  if (days < 0) {
    return { label, value: "완료", spoken: "전역했어요", muted: true };
  }
  return {
    label,
    value: dday(days),
    spoken: days === 0 ? "오늘 전역해요" : `전역까지 ${days}일 남았어요`,
    muted: false,
  };
}

export function friendNextLeaveDday(
  friend: Pick<Friend, "nextLeave" | "leaveScheduleShared">,
  today: ISODate,
): FriendDday {
  if (!friend.leaveScheduleShared) {
    return {
      label: "다음 휴가",
      value: "비공개",
      spoken: "휴가 일정 비공개",
      muted: true,
    };
  }
  const leave = friend.nextLeave;
  if (!leave) {
    return {
      label: "다음 휴가",
      value: "없음",
      spoken: "잡힌 휴가가 없어요",
      muted: true,
    };
  }
  if (leave.startDate <= today) {
    const days = Math.max(diffDays(today, leave.endDate), 0);
    return {
      label: "휴가 중",
      value: `복귀 ${dday(days)}`,
      spoken:
        days === 0
          ? "휴가 중이에요. 오늘 복귀해요"
          : `휴가 중이에요. 복귀까지 ${days}일 남았어요`,
      muted: false,
    };
  }
  const days = diffDays(today, leave.startDate);
  return {
    label: "다음 휴가",
    value: dday(days),
    spoken: `다음 휴가까지 ${days}일 남았어요`,
    muted: false,
  };
}
