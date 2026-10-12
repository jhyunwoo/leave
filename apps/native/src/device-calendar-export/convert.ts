/**
 * 피드 항목 → 기기 캘린더 일정 입력. 순수 함수라 기기 없이 테스트한다.
 *
 * 사용처: ./bridge.android.ts(쓰기), ./calendar-export-sync.android.tsx(서명 비교).
 */
import type { FeedItem } from "@leave/shared/calendar-feed";
import { addDays } from "@leave/shared/dates";

export type DeviceEventInput = {
  title: string;
  notes: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  timeZone: string;
};

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function seoulTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

/**
 * 안드로이드 캘린더 제공자는 종일 일정을 **UTC 자정**으로 저장하라고 요구한다.
 * 서울 자정(= 전날 15:00 UTC)으로 쓰면 삼성 캘린더에서 하루 앞당겨 보인다.
 * 끝은 배타적이라 끝날 다음 날 자정이다.
 */
export function toDeviceEvent(item: FeedItem): DeviceEventInput {
  if (item.startTime === null) {
    return {
      title: item.title,
      notes: item.description ?? "",
      startDate: utcMidnight(item.startDate),
      endDate: utcMidnight(addDays(item.endDate, 1)),
      allDay: true,
      timeZone: "UTC",
    };
  }
  const start = seoulTime(item.startDate, item.startTime);
  return {
    title: item.title,
    notes: item.description ?? "",
    startDate: start,
    // 안드로이드는 반복 없는 일정에 끝 시각을 요구한다. 끝이 없으면 시작 시각에 끝낸다.
    endDate:
      item.endTime === null ? start : seoulTime(item.endDate, item.endTime),
    allDay: false,
    timeZone: "Asia/Seoul",
  };
}

/**
 * 마지막으로 쓴 내용과 같은지 가리는 서명. 서버가 정렬해 보내므로(buildFeedItems)
 * 직렬화한 문자열을 FNV-1a로 접기만 하면 된다. 보안 용도가 아니다.
 */
export function itemsSignature(items: readonly FeedItem[]): string {
  const text = JSON.stringify(items);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${items.length}:${hash.toString(16)}`;
}
