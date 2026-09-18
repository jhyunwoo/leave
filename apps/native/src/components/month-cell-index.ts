/**
 * 월 그리드 한 칸이 "그날 무엇이 있는가"를 조회만으로 알게 해 주는 표들 — 순수 부분.
 *
 * 사용처: components/month-calendar.tsx.
 *
 * 컴포넌트에서 떼어 둔 이유는 `month-window.ts`와 같다 — 이 계산은 날짜 문자열
 * 몇 개에서 나오는 순수 함수라 화면이 필요 없고, `apps/native/test`는 node 환경이라
 * react-native를 불러올 수 없다.
 */

import { addDays, type ISODate } from "@leave/shared/dates";

/** 기간을 가진 항목. 부대 일정·개인 일정이 모두 이 모양이다. */
export type DatedRange = { startDate: ISODate; endDate: ISODate };

/**
 * 날짜 → 그날에 걸친 항목들.
 *
 * 없으면 칸마다 목록 전체를 `filter`하게 되어 한 달을 그리는 데 O(42 × 항목 수)가
 * 든다. 무한 스크롤은 이 그리드를 달마다, 스크롤 내내 다시 그린다 —
 * `@leave/client`의 `buildMyLeaveDayMap`이 내 휴가를 같은 이유로 미리 펼쳐 둔다.
 *
 * **격자가 실제로 그리는 범위만 담는다.** 검열처럼 몇 달에 걸친 일정을 그대로
 * 펼치면 보지도 않을 날짜가 표에 쌓여, 줄이려던 비용이 그대로 돌아온다.
 *
 * 한 날짜 안의 순서는 입력 순서 그대로다 — 칸 라벨이 "첫 제목 + 나머지 개수"라
 * 무엇이 첫 제목인지가 응답 순서에 달려 있다(`personalEventCellLabel`).
 */
export function buildRangeIndex<T extends DatedRange>(
  items: readonly T[] | undefined,
  from: ISODate,
  through: ISODate,
): Map<ISODate, T[]> {
  const byDate = new Map<ISODate, T[]>();
  if (!items || from > through) return byDate;
  for (const item of items) {
    const start = item.startDate < from ? from : item.startDate;
    const end = item.endDate > through ? through : item.endDate;
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const list = byDate.get(date);
      if (list) list.push(item);
      else byDate.set(date, [item]);
    }
  }
  return byDate;
}

/**
 * 드래그 덧그림에서 이 달에 걸친 칸만 골라 낸다. 하나도 없으면 `null`.
 *
 * `null`이 중요하다 — 끌고 있는 휴가가 지나지 않는 달은 hover가 바뀌어도 **같은
 * 값**(null)을 받아 `MonthCalendar`의 `memo`에 걸린다. 그래서 손가락이 칸 하나를
 * 지날 때 다시 그려지는 달이 마운트된 전부가 아니라 출발·도착 달 둘로 줄어든다.
 */
export function sliceMonthPreview<T>(
  preview: ReadonlyMap<ISODate, T> | null,
  month: string,
): Map<ISODate, T> | null {
  if (!preview) return null;
  let slice: Map<ISODate, T> | null = null;
  for (const [date, day] of preview) {
    if (!date.startsWith(month)) continue;
    (slice ??= new Map()).set(date, day);
  }
  return slice;
}
