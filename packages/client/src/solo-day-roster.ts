/**
 * 부대가 없는 사람의 날짜 상세 명단 — 내 휴가를 부대 달력의 출타 명단 모양으로 옮긴다.
 *
 * 사용처: 웹/네이티브 달력의 날짜 상세 패널(DayPanel).
 *
 * 날짜 상세는 부대 달력 응답(`Calendar`)의 명단을 그린다. 부대가 없으면 그 조회가
 * 꺼져 있어, 명단은커녕 패널 자체가 뜨지 않았다 — 휴가 등록 버튼도 그 패널 안에
 * 있으므로 부대가 없는 사람은 날짜를 눌러도 아무것도 할 수 없었다. 명단 모양을
 * 맞추면 패널이 부대 유무와 상관없이 같은 코드로 그려진다.
 *
 * 부대 명단은 서버가 초안을 빼고 내려주지만 여기서는 넣는다. 초안은 "남에게
 * 보이지 않는 내 계획"일 뿐이고, 이 명단을 보는 사람은 나 하나다. 반려·취소는
 * 잔여에서도 빠지는 기록이라 뺀다(`countsAgainstBalance`).
 */
import { countsAgainstBalance } from "@leave/shared/leave";
import type { Calendar, MyLeave } from "./types";

export function soloDayRoster(
  leaves: readonly MyLeave[] | undefined,
  me: { id: string; name: string } | undefined,
): Calendar["attendees"] {
  if (!me) return [];
  return (leaves ?? [])
    .filter((leave) => countsAgainstBalance(leave.status))
    .map((leave) => ({
      leaveId: leave.id,
      userId: me.id,
      name: me.name,
      // 내 행은 "내 계획"으로 그리므로 계급을 쓰지 않는다.
      rankLabel: "",
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      segments: leave.segments,
    }));
}
