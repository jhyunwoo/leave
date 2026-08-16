/**
 * 내 휴가를 "다가오는 / 지난" 두 섹션으로 가른다.
 *
 * 사용처: 웹·네이티브의 내 휴가 화면.
 *
 * 다음 주에 나갈 휴가와 반년 전에 다녀온 휴가를 한 목록에 같은 무게로 쌓으면, 계획을
 * 확인하려고 지나간 것들을 눈으로 걸러야 한다.
 *
 * 경계는 종료일로 잡는다 — **오늘 끝나는 휴가는 아직 지나가지 않았다.** 오늘 진행
 * 중인 휴가도 다가오는 쪽이고, 시작일이 과거라 정렬상 자연히 맨 위에 온다.
 *
 * 규칙이 두 화면에 각각 적히면 한쪽만 고쳐져 순서가 갈린다. 그래서 여기 한 벌만 둔다.
 */
import { todayInSeoul, type ISODate } from "@leave/shared";
import type { MyLeave } from "./types";

export type MyLeaveSections = {
  /** 아직 끝나지 않은 휴가. 가까운 것부터. */
  upcoming: MyLeave[];
  /** 이미 끝난 휴가. 최근에 끝난 것부터. */
  past: MyLeave[];
};

export function partitionMyLeaves(
  leaves: readonly MyLeave[] | undefined,
  today: ISODate = todayInSeoul(),
): MyLeaveSections {
  const upcoming: MyLeave[] = [];
  const past: MyLeave[] = [];
  for (const leave of leaves ?? []) {
    (leave.endDate < today ? past : upcoming).push(leave);
  }
  upcoming.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate),
  );
  past.sort(
    (a, b) =>
      b.endDate.localeCompare(a.endDate) ||
      b.startDate.localeCompare(a.startDate),
  );
  return { upcoming, past };
}
