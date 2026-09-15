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
// 도메인 하위 경로에서 직접 가져온다. 배럴(`@leave/shared`)은 zod 스키마까지 함께
// 평가시킨다 — 자세한 배경은 packages/shared/src/index.ts 주석 참고.
import { todayInSeoul, type ISODate } from "@leave/shared/dates";
import { isOutingSegments, type LeaveKind } from "@leave/shared/leave";
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

/** 갈래별로 가른 내 휴가. 탭 하나가 두 목록을 함께 바꾸므로 갈래가 바깥이다. */
export type MyLeaveKindSections = Record<LeaveKind, MyLeaveSections>;

/**
 * 휴가와 외출을 갈라 각각 "다가오는 / 지난"으로 나눈다.
 *
 * 사용처: 웹·네이티브 내 휴가 화면의 휴가/외출 탭.
 *
 * 외출은 당일 복귀라 휴가와 한 목록에 쌓이면 "다음에 언제 나가는가"가 묻히고,
 * 세는 단위부터 다르다(일 vs 회). D-day 카드는 이미 둘을 갈라 센다
 * (`nextLeaveCountdowns`) — 목록도 같은 기준을 쓴다.
 *
 * 시간 규칙은 여기 다시 적지 않고 `partitionMyLeaves`를 그대로 쓴다. 여기서 하는 것은
 * 목록을 갈래로 나누는 일뿐이다 — 두 곳에 적히면 한쪽만 고쳐져 탭을 켠 목록과 D-day
 * 카드가 다른 기준으로 움직인다.
 *
 * 갈래 판정은 서버와 함께 쓰는 `isOutingSegments` 하나뿐이다(구간이 **전부** 외출일
 * 때만 외출 — 옛 행은 연가가 섞여 있을 수 있다).
 *
 * 두 갈래 키는 비어 있어도 항상 있다. 화면이 `byKind[kind]`를 그대로 색인하고,
 * 고른 갈래가 비었을 때 "없다"를 그릴 수 있어야 한다.
 */
export function partitionMyLeavesByKind(
  leaves: readonly MyLeave[] | undefined,
  today: ISODate = todayInSeoul(),
): MyLeaveKindSections {
  const buckets: Record<LeaveKind, MyLeave[]> = { leave: [], outing: [] };
  for (const leave of leaves ?? []) {
    buckets[isOutingSegments(leave.segments) ? "outing" : "leave"].push(leave);
  }
  return {
    leave: partitionMyLeaves(buckets.leave, today),
    outing: partitionMyLeaves(buckets.outing, today),
  };
}
