/**
 * 외부 캘린더로 내보내는 일정 한 건 — 구독 피드(.ics)와 안드로이드 기기 캘린더가
 * 같은 목록을 받는다.
 *
 * 사용처: apps/api의 `/calendar/:token.ics`와 `/calendar-feed/items`,
 * apps/native의 기기 캘린더 동기화.
 *
 * 두 출구가 규칙을 따로 가지면 같은 계정의 아이폰과 갤럭시가 다른 일정을 보여 준다.
 * 그래서 "무엇을 어떤 제목으로 내보내는가"는 여기 한 곳에서만 정한다.
 */
import { addMonthsClamped, type ISODate } from "./dates";
import {
  balanceLabel,
  isOutingSegments,
  LEAVE_STATUS_LABELS,
  segmentBalanceKey,
  type LeaveCategory,
  type LeaveStatus,
  type OutingKind,
  type OvernightKind,
} from "./leave";

/**
 * 시간 불변식: `startTime`이 null이면 종일 일정이다. `endTime`은 `startTime`이 있을
 * 때만 있고, `endTime`이 null인 시각 일정은 하루짜리다(`buildFeedItems`가 보장).
 */
export type FeedItem = {
  /** 안정 식별자. 외부 캘린더가 이 값으로 "같은 일정"을 알아본다. */
  uid: string;
  title: string;
  description: string | null;
  startDate: ISODate;
  endDate: ISODate;
  startTime: string | null;
  endTime: string | null;
};

/** 실제로 나가지 않은 휴가. 초안은 내보낸다 — 제목으로 구분한다. */
export const FEED_EXCLUDED_LEAVE_STATUSES: readonly LeaveStatus[] = [
  "rejected",
  "cancelled",
];

/**
 * 피드가 담는 가장 이른 날. 이날 이후에 **끝나는** 일정만 싣는다.
 * 지난 일정을 끝없이 실으면 피드가 커지고, 구글은 큰 피드를 더 늦게 받아 간다.
 */
export function feedRangeStart(today: ISODate): ISODate {
  return addMonthsClamped(today, -6);
}

export type FeedLeaveInput = {
  id: string;
  title: string;
  startDate: ISODate;
  endDate: ISODate;
  returnTime: string;
  reason: string | null;
  status: LeaveStatus;
  segments: {
    category: LeaveCategory;
    overnightKind: OvernightKind | null;
    outingKind: OutingKind | null;
    startDate: ISODate;
    endDate: ISODate;
  }[];
};

type FeedEventBase = {
  id: string;
  title: string;
  startDate: ISODate;
  endDate: ISODate;
  startTime: string | null;
  endTime: string | null;
};

export type FeedPersonalEventInput = FeedEventBase & { note: string | null };
export type FeedUnitEventInput = FeedEventBase & { details: string | null };

function monthDay(date: ISODate): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function leaveKindPrefix(segments: FeedLeaveInput["segments"]): string {
  if (isOutingSegments(segments)) return "[외출]";
  if (
    segments.length > 0 &&
    segments.every((segment) => segment.category === "overnight")
  ) {
    return "[외박]";
  }
  return "[휴가]";
}

function joinLines(lines: readonly (string | null)[]): string | null {
  const kept = lines.filter((line): line is string => Boolean(line));
  return kept.length > 0 ? kept.join("\n") : null;
}

/**
 * 휴가 한 건 = 일정 하나. 구간마다 쪼개지 않는다 — "연가 4일 + 정기외박 4일"은 한 번의
 * 출타인데, 바깥 캘린더에서 두 칸이 맞붙으면 두 번 나가는 것처럼 읽힌다.
 */
function leaveItem(leave: FeedLeaveInput): FeedItem {
  const prefix = leaveKindPrefix(leave.segments);
  const draft = leave.status === "draft" ? "(초안) " : "";
  const segmentLine = leave.segments
    .map((segment) => {
      const range =
        segment.startDate === segment.endDate
          ? monthDay(segment.startDate)
          : `${monthDay(segment.startDate)}~${monthDay(segment.endDate)}`;
      const key = segmentBalanceKey({
        category: segment.category,
        overnightKind: segment.overnightKind ?? undefined,
        outingKind: segment.outingKind ?? undefined,
      });
      return `${range} ${balanceLabel(key)}`;
    })
    .join(" · ");
  return {
    uid: `leave-${leave.id}`,
    title: `${draft}${prefix} ${leave.title}`,
    description: joinLines([
      segmentLine || null,
      `상태: ${LEAVE_STATUS_LABELS[leave.status]}`,
      `복귀 ${leave.returnTime}`,
      leave.reason ? `사유: ${leave.reason}` : null,
    ]),
    startDate: leave.startDate,
    endDate: leave.endDate,
    startTime: null,
    endTime: null,
  };
}

/**
 * 시간 규칙. 시작 시간이 있고 (끝 시간이 있거나 하루짜리)일 때만 시각 일정이다.
 * 여러 날짜에 시작 시간만 있는 일정을 시각 일정으로 만들면 시작 순간 하나로
 * 줄어들어 여러 날이라는 사실이 사라진다. 그런 일정은 종일로 두고 시간을 설명에 적는다.
 */
function eventItem(
  uid: string,
  title: string,
  event: FeedEventBase,
  body: string | null,
): FeedItem {
  const timed =
    event.startTime !== null &&
    (event.endTime !== null || event.startDate === event.endDate);
  const hint =
    !timed && (event.startTime !== null || event.endTime !== null)
      ? `${event.startTime ?? ""}~${event.endTime ?? ""}`
      : null;
  return {
    uid,
    title,
    description: joinLines([hint, body]),
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: timed ? event.startTime : null,
    endTime: timed ? event.endTime : null,
  };
}

export function buildFeedItems(input: {
  leaves: readonly FeedLeaveInput[];
  personalEvents: readonly FeedPersonalEventInput[];
  unitEvents: readonly FeedUnitEventInput[];
  unitName: string | null;
}): FeedItem[] {
  const unitPrefix = input.unitName ? `[${input.unitName}] ` : "";
  const items = [
    ...input.leaves
      .filter((leave) => !FEED_EXCLUDED_LEAVE_STATUSES.includes(leave.status))
      .map(leaveItem),
    ...input.personalEvents.map((event) =>
      eventItem(`personal-${event.id}`, event.title, event, event.note),
    ),
    ...input.unitEvents.map((event) =>
      eventItem(
        `unit-event-${event.id}`,
        `${unitPrefix}${event.title}`,
        event,
        event.details,
      ),
    ),
  ];
  // 순서를 고정해야 같은 데이터가 같은 피드·같은 서명을 낸다(안드로이드 동기화가 서명을 비교한다).
  return items.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.uid.localeCompare(b.uid),
  );
}

/** 아이폰은 `webcal://` 링크를 열면 구독 확인 창을 띄운다. */
export function calendarFeedWebcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//, "webcal://");
}

/** 구글 캘린더의 "URL로 추가" 화면. 삼성 캘린더는 이 구글 계정을 거쳐 받는다. */
export function googleCalendarSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
    calendarFeedWebcalUrl(feedUrl),
  )}`;
}
