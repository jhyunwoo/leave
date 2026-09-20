/**
 * 달력에서 일정을 끌어 옮기는 동안의 상태.
 *
 * 세 곳이 이 상태를 나눠 쓴다 —
 * - `components/calendar-scroll.tsx`가 격자 치수와 목록 스크롤을 연결한다.
 * - `components/calendar-drag`가 항목 선택과 두 손가락 이동을 맡는다.
 * - `screens/calendar/index.tsx`가 휴가·개인 일정 목록과 저장을 쥐고 있어,
 *   미리보기를 파생하고 놓인 순간 실제로 저장한다.
 *
 * 셋이 서로를 직접 알지 않도록 jotai로 묶었다(`state/auth.ts`와 같은 방식). prop으로
 * 내리면 `MonthBlock` → `MonthCalendar`를 지나야 하는데, 그러면 손가락이 칸을 지날
 * 때마다 달력 전체가 다시 그려진다. 조각별 구독이면 필요한 곳만 다시 그린다.
 */

import type { ISODate } from "@leave/shared/dates";
import { atom } from "jotai";
import type { MyLeaveDay } from "@leave/client";

/**
 * 달력 격자의 치수. `CalendarScroll`이 창 크기에 맞춰 계산해 둔 값을 그대로 옮긴다.
 * 드래그 도중 앞뒤로 달이 붙으면 좌표 원점도 함께 보정한다.
 */
export type CalendarGridMetrics = {
  /** 달 블록 하나의 높이. */
  itemHeight: number;
  /** 주 행 하나의 세로 간격(칸 높이 + 여백). */
  rowPitch: number;
  /** 칸 하나의 가로 간격(칸 너비 + 여백). */
  colPitch: number;
  /** 달 이름 띠 높이. */
  labelHeight: number;
  /** 지금 목록에 담긴 달들. */
  months: readonly string[];
};

/**
 * 옮긴 자리가 저장될 수 있는지. 서버가 최종 판단이지만, 기간이 겹치는 것만은
 * 서버와 같은 함수(`planLeaveMerge`)로 미리 알 수 있어 놓기 전에 막는다.
 */
export type LeaveDragVerdict =
  /** 그대로 저장된다. */
  | "ok"
  /** 앞뒤 휴가와 한 건으로 합쳐진다. 결과 id가 바뀔 수 있다. */
  | "merge"
  /** 다른 휴가와 기간이 겹친다. 놓을 수 없다. */
  | "conflict";

/**
 * 달력에서 끌 수 있는 것.
 *
 * 세션·격자·두 손가락 스크롤(`components/calendar-drag/`)은 이게 무엇인지 **모른다**.
 * 아는 쪽은 양 끝뿐이다 — 무엇을 집었는지 정하는 칸과, 놓였을 때 저장하는 화면.
 */
export type CalendarDragSubject =
  | { kind: "leave"; leaveId: string }
  | { kind: "personalEvent"; eventId: string };

export type CalendarDragPhase =
  /** 손가락이 아직 화면에 있다. */
  | "dragging"
  /** 이동 없이 길게 누르고 놓았다. 편집 옵션을 연다. */
  | "editing"
  /** 손을 뗐다. 달력 화면이 이 상태를 보고 저장을 시작한다. */
  | "dropped"
  /** 서버에 보내는 중. 미리보기를 그대로 둔 채 기다린다. */
  | "saving";

export type CalendarDrag = {
  subject: CalendarDragSubject;
  /** 집어 든 칸의 날짜. 이동량은 이 날짜를 기준으로 잰다. */
  grabDate: ISODate;
  /** 지금 놓이게 될 날짜. 놓을 수 없는 자리 위면 null. */
  hoverDate: ISODate | null;
  /** 항목 전체가 밀려날 일수. */
  deltaDays: number;
  /** 손떨림을 넘는 이동이나 두 번째 손가락 스크롤을 한 적이 있는가. */
  hasMoved: boolean;
  phase: CalendarDragPhase;
};

/**
 * 미리보기로 덧그리는 칸 하나.
 *
 * 저장된 칸과 **같은 필드**를 갖는 것이 중요하다 — 칩은 둘 중 무엇이 오든 같은
 * 규칙으로 그려야 하고, 그래야 옮기는 중에도 색·이어붙임이 그대로 보인다.
 */
export type LeaveDragDay = MyLeaveDay & {
  /** 원래 자리인지, 옮겨 갈 자리인지. 두 자리가 겹치면 target이 이긴다. */
  role: "origin" | "target";
  verdict: LeaveDragVerdict;
  phase: CalendarDragPhase;
};

export const calendarGridMetricsAtom = atom<CalendarGridMetrics | null>(null);

export const calendarDragAtom = atom<CalendarDrag | null>(null);

/**
 * 드래그 중인지만 알면 되는 곳(스크롤 동결)이 hover 변화마다 다시 그리지 않도록
 * 불리언으로 좁혀 둔다.
 */
export const calendarDragActiveAtom = atom(
  (get) => get(calendarDragAtom) !== null,
);

/**
 * 날짜 → 덧그릴 칩. 달력 화면이 휴가 목록과 겹침 판정을 합쳐 만든다.
 *
 * 전체 `myLeaveDays`를 다시 만들지 않고 이 작은 맵만 갈아 끼우는 것이 중요하다 —
 * 그 맵의 참조가 바뀌면 마운트된 모든 달의 메모가 무효화되어, 칸 하나 지날 때마다
 * 달력 전체가 다시 계산된다.
 */
export const calendarDragPreviewAtom = atom<Map<ISODate, LeaveDragDay> | null>(
  null,
);
