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
import type { ISODate } from "./dates";

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
