/**
 * 기기 캘린더 bridge — iOS·웹 구현(아무것도 하지 않는다).
 * 아이폰은 구독 링크가 기본 캘린더에 그대로 붙어 직접 쓰기가 필요 없다.
 * `.android.ts` 짝이 Metro의 플랫폼 확장자 규칙에 따라 안드로이드에서 선택된다.
 */
import type { FeedItem } from "@leave/shared/calendar-feed";

export const deviceExportSupported = false;

export async function requestExportPermission(): Promise<boolean> {
  return false;
}

export async function hasExportPermission(): Promise<boolean> {
  return false;
}

export async function writeItems(
  _items: readonly FeedItem[],
  calendarId: string | null,
): Promise<string> {
  return calendarId ?? "";
}

export async function ownCalendarPresent(
  _calendarId: string | null,
): Promise<boolean> {
  return true;
}

export async function removeExportCalendar(): Promise<void> {}
