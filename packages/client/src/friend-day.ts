/**
 * 친구 달력에서 고른 하루 — 그날 걸친 출타를 읽을 수 있는 모양으로 정리한다.
 *
 * 사용처: 네이티브·웹의 날짜 상세 패널과 두 달력의 격자 칸.
 *
 * 응답의 `leaves`는 그 달에 **걸친** 휴가 전부라 화면마다 "이 날에 겹치는가"를 다시
 * 걸러야 하고, 사람 이름은 `people`에 따로 있어 매번 Map을 만들어 붙여야 했다. 그
 * 두 가지와 "며칠 중 며칠째인가"라는 뺄셈이 웹·앱에 각각 적히면 한쪽만 고쳐진다.
 */
import { diffDays, type ISODate } from "@leave/shared/dates";
import { inclusiveDays, type LeaveKind } from "@leave/shared/leave";
import type { FriendCalendar, FriendCalendarLeave } from "./types";

export type FriendDayLeave = {
  leaveId: string;
  userId: string;
  /** 조회자 본인이면 화면이 이름 대신 "나"로 부른다. */
  isViewer: boolean;
  name: string;
  kind: LeaveKind;
  status: FriendCalendarLeave["status"];
  startDate: ISODate;
  endDate: ISODate;
  /** 출타 전체 일수(시작일·종료일 포함). */
  totalDays: number;
  /** 고른 날이 그 출타의 몇 일째인가. 1부터 센다. */
  dayIndex: number;
  isFirstDay: boolean;
  isLastDay: boolean;
};

/** 격자 칸이 쓰는 사람 한 명 분량 — 그날 이 사람이 무엇으로 나가 있는가. */
export type FriendDayPerson = { userId: string; kind: LeaveKind };

/**
 * 갈래는 서버가 판정해 `kind`로 내려준다(`isOutingSegments`).
 *
 * 없으면 휴가로 읽는다 — 앱 배포가 API 배포보다 앞설 수 있고, 그 사이에는 구분이
 * 사라지는 편이 빈 칩이 붙는 것보다 낫다.
 */
function kindOf(leave: FriendCalendarLeave): LeaveKind {
  return leave.kind ?? "leave";
}

function coversDate(leave: FriendCalendarLeave, date: ISODate): boolean {
  return leave.startDate <= date && date <= leave.endDate;
}

/**
 * 그날 걸친 출타를 사람 정보와 함께, 읽는 순서대로.
 *
 * 내 일정이 맨 위에 온다 — 이 화면에서 하는 일은 "친구와 내 날짜를 맞춰 보는 것"이라
 * 기준이 되는 내 줄이 먼저 보여야 한다. 그 다음은 이름순이고, 같은 사람이 여러 건이면
 * 시작일이 빠른 것부터다.
 */
export function friendDayLeaves(
  calendar: FriendCalendar | undefined,
  date: ISODate,
): FriendDayLeave[] {
  if (!calendar) return [];
  const personById = new Map(
    calendar.people.map((person) => [person.userId, person]),
  );
  return calendar.leaves
    .filter((leave) => coversDate(leave, date))
    .map((leave) => {
      const person = personById.get(leave.userId);
      return {
        leaveId: leave.leaveId,
        userId: leave.userId,
        isViewer: person?.isViewer ?? false,
        name: person?.name ?? "",
        kind: kindOf(leave),
        status: leave.status,
        startDate: leave.startDate,
        endDate: leave.endDate,
        totalDays: inclusiveDays(leave.startDate, leave.endDate),
        dayIndex: diffDays(leave.startDate, date) + 1,
        isFirstDay: leave.startDate === date,
        isLastDay: leave.endDate === date,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isViewer) - Number(a.isViewer) ||
        a.name.localeCompare(b.name) ||
        a.startDate.localeCompare(b.startDate) ||
        a.leaveId.localeCompare(b.leaveId),
    );
}

/**
 * 격자 칸에 찍을 사람 목록. 한 사람은 한 번만 나온다.
 *
 * 같은 날 외출과 휴가를 함께 가진 사람은 휴가로 친다 — 칸에서 답해야 하는 것은
 * "이 사람이 그날 부대에 없는가"이고, 그 답을 더 크게 만드는 쪽이 휴가다.
 */
export function friendDayPeople(
  leaves: readonly FriendCalendarLeave[],
  date: ISODate,
): FriendDayPerson[] {
  const byUser = new Map<string, LeaveKind>();
  for (const leave of leaves) {
    if (!coversDate(leave, date)) continue;
    const kind = kindOf(leave);
    if (kind === "leave" || !byUser.has(leave.userId)) {
      byUser.set(leave.userId, kind);
    }
  }
  return [...byUser].map(([userId, kind]) => ({ userId, kind }));
}
