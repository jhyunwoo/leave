import { describe, expect, it } from "vitest";
import type { FeedItem } from "@leave/shared/calendar-feed";
import {
  itemsSignature,
  toDeviceEvent,
} from "../src/device-calendar-export/convert";
import { normalizeExportPreferences } from "../src/device-calendar-export/preferences";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    uid: "leave-1",
    title: "[휴가] 여름 휴가",
    description: "8/2~8/5 연가",
    startDate: "2026-08-02",
    endDate: "2026-08-05",
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

describe("toDeviceEvent", () => {
  it("종일 일정은 UTC 자정, 끝은 끝날 다음 날 UTC 자정", () => {
    const event = toDeviceEvent(item());
    expect(event.allDay).toBe(true);
    expect(event.timeZone).toBe("UTC");
    expect(event.startDate.getTime()).toBe(Date.UTC(2026, 7, 2));
    expect(event.endDate.getTime()).toBe(Date.UTC(2026, 7, 6));
  });

  it("시각 일정은 서울 시각으로", () => {
    const event = toDeviceEvent(
      item({
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        startTime: "09:30",
        endTime: "18:00",
      }),
    );
    expect(event.allDay).toBe(false);
    expect(event.timeZone).toBe("Asia/Seoul");
    expect(event.startDate.toISOString()).toBe("2026-10-01T00:30:00.000Z");
    expect(event.endDate.toISOString()).toBe("2026-10-02T09:00:00.000Z");
  });

  it("끝 시간이 없는 시각 일정은 시작과 같은 시각에 끝난다", () => {
    const event = toDeviceEvent(
      item({
        startDate: "2026-10-01",
        endDate: "2026-10-01",
        startTime: "09:30",
      }),
    );
    expect(event.endDate.getTime()).toBe(event.startDate.getTime());
  });

  it("설명이 없으면 빈 메모", () => {
    expect(toDeviceEvent(item({ description: null })).notes).toBe("");
  });
});

describe("itemsSignature", () => {
  it("같은 항목은 같은 서명, 하나라도 바뀌면 다른 서명", () => {
    const a = [item(), item({ uid: "leave-2" })];
    expect(itemsSignature(a)).toBe(
      itemsSignature([item(), item({ uid: "leave-2" })]),
    );
    expect(itemsSignature(a)).not.toBe(
      itemsSignature([item(), item({ uid: "leave-2", title: "바뀜" })]),
    );
    expect(itemsSignature([])).not.toBe(itemsSignature(a));
  });
});

describe("normalizeExportPreferences", () => {
  it("저장된 적 없으면 꺼짐", () => {
    expect(normalizeExportPreferences(undefined)).toEqual({
      enabled: false,
      calendarId: null,
      signature: null,
    });
  });

  it("모양이 어긋난 값은 버린다", () => {
    expect(
      normalizeExportPreferences({
        enabled: "yes",
        calendarId: 3,
        signature: ["x"],
      }),
    ).toEqual({
      enabled: false,
      calendarId: null,
      signature: null,
    });
  });

  it("아는 값은 지킨다", () => {
    const value = { enabled: true, calendarId: "12", signature: "3:abc" };
    expect(normalizeExportPreferences(value)).toEqual(value);
  });
});
