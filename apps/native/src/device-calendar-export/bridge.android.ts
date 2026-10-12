/**
 * 기기 캘린더 bridge — 안드로이드 구현. expo-calendar와 닿는 유일한 자리.
 *
 * 우리가 만든 `리브` 로컬 캘린더 **안에만** 쓴다. 사용자의 다른 캘린더는 읽지도
 * 고치지도 않는다. 끌 때는 그 캘린더를 통째로 지운다.
 */
import type { FeedItem } from "@leave/shared/calendar-feed";
import * as Calendar from "expo-calendar/legacy";
import { toDeviceEvent } from "./convert";
import {
  getExportPreferences,
  loadExportPreferences,
  saveExportPreferences,
  defaultExportPreferences,
} from "./preferences";

export const deviceExportSupported = true;

const CALENDAR_TITLE = "리브";
/** 사용자가 지운 캘린더와 지금 일정을 모두 덮을 만큼 넓은 범위. */
const SCAN_START = new Date(Date.UTC(2000, 0, 1));
const SCAN_END = new Date(Date.UTC(2100, 0, 1));

export async function requestExportPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

export async function hasExportPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === "granted";
}

/**
 * 우리가 만든 캘린더(`name: "leave"` + 로컬 계정)만 고른다. 저장된 id가 낡아 사용자의
 * 다른 캘린더를 가리킬 수 있어 id만 믿으면 그 캘린더를 비우거나 지우게 된다.
 * 쓰기가 중간에 실패해 설정에 id가 남지 않은 고아 캘린더도 여기서 다시 찾아 재사용한다.
 */
async function findOwnCalendarId(
  preferredId: string | null,
): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const own = calendars.filter(
    (calendar) =>
      calendar.name === "leave" && calendar.source?.isLocalAccount === true,
  );
  return (
    own.find((calendar) => calendar.id === preferredId)?.id ??
    own[0]?.id ??
    null
  );
}

async function createCalendar(): Promise<string> {
  return Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    name: "leave",
    color: "#347a1f",
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: CALENDAR_TITLE, type: "LOCAL" },
    ownerAccount: "leave",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

/**
 * 바뀌었으면 다시 쓴다. 일정별로 차이를 맞추는 것보다 느리지만 어긋날 수가 없다 —
 * 어긋난 동기화가 남기는 유령 일정은 틀린 날짜를 믿게 만든다.
 * 사용자가 `리브` 캘린더를 지웠으면 새로 만든다.
 */
export async function writeItems(
  items: readonly FeedItem[],
  calendarId: string | null,
): Promise<string> {
  const id = (await findOwnCalendarId(calendarId)) ?? (await createCalendar());
  const existing = await Calendar.getEventsAsync([id], SCAN_START, SCAN_END);
  for (const event of existing) {
    await Calendar.deleteEventAsync(event.id);
  }
  for (const item of items) {
    await Calendar.createEventAsync(id, toDeviceEvent(item));
  }
  return id;
}

/**
 * 끄기·로그아웃·인증 만료. 권한이 없으면 지울 수 없으니 설정만 비운다.
 *
 * 로그아웃이 캘린더 정리에 걸리면 안 되므로 어떤 오류도 밖으로 던지지 않는다.
 * 저장된 id가 없어도(첫 쓰기 도중에 껐을 때) 소유 캘린더를 찾아 지운다.
 */
export async function removeExportCalendar(): Promise<void> {
  try {
    await loadExportPreferences();
    if (await hasExportPermission()) {
      const ownId = await findOwnCalendarId(getExportPreferences().calendarId);
      if (ownId !== null) {
        await Calendar.deleteCalendarAsync(ownId);
      }
    }
  } catch {
    // 캘린더 제공자 오류로 남은 캘린더는 사용자가 기기 설정에서 지울 수 있다.
  }
  try {
    await saveExportPreferences(defaultExportPreferences);
  } catch {
    // 저장소 오류가 로그아웃을 막지 않는다.
  }
}
