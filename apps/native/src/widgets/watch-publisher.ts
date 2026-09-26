import type { WidgetState, WidgetTimelineEntry } from "./payload";

/** 페이스 컴플리케이션 JSON — 워치 `WatchFaceData`와 필드 이름이 같아야 한다. */
export type LeaveWatchFaceData = {
  state: WidgetState;
  discharge: { days: number; date: string } | null;
  progress: number | null;
  dutyDays: number | null;
  /** `date`는 카운트다운의 목표 날짜 — 워치가 자정이 지나도 days를 다시 센다. */
  nextLeave: {
    days: number;
    date: string;
    title: string;
    range: string;
  } | null;
  nextOuting: {
    days: number;
    date: string;
    title: string;
    range: string;
  } | null;
};

/**
 * 전체화면 복무율·컴플리케이션처럼 타임라인 지표에 없는 값이 필요한 워치 UI에
 * 쓰는 원자료. iOS에만 의미가 있고 다른 플랫폼은 무시한다.
 */
export type WatchPublishContext = {
  service?: { enlistedAt: string; dischargeAt: string } | null;
  face?: LeaveWatchFaceData | null;
};

/** Web/Android have no watch companion. Metro selects .ios on iPhone. */
export function publishWatchTimeline(
  _entries: WidgetTimelineEntry[],
  _context?: WatchPublishContext,
): void {}
