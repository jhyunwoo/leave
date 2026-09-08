/** 두 손가락의 역할과 스크롤 좌표를 보존한다. 네이티브 이벤트 순서와 독립적으로 검증한다. */
import { buildMonthGrid, splitMonth } from "@leave/shared/calendar";
import { diffDays, type ISODate } from "@leave/shared/dates";
import type { CalendarGridMetrics, LeaveDrag } from "@/state/calendar-drag";
import {
  locateDate,
  resolveDrop,
  type DragLattice,
  type LatticeCell,
} from "./lattice";

export type CalendarTouch = {
  id: number;
  absoluteX: number;
  absoluteY: number;
};
const MOVE_SLOP = 8;

function monthNumber(month: string): number {
  const { year, monthNum } = splitMonth(month);
  return year * 12 + monthNum;
}

export class CalendarDragSession {
  readonly drag: LeaveDrag;
  scrollOffset: number;
  private startOffset: number;
  private metrics: CalendarGridMetrics;
  private lattice: DragLattice;
  private from: LatticeCell;
  private primary: CalendarTouch;
  private secondary: CalendarTouch | null = null;
  private moved = false;

  get hasMoved(): boolean {
    return this.moved;
  }

  constructor(
    leaveId: string,
    date: ISODate,
    private readonly start: CalendarTouch,
    metrics: CalendarGridMetrics,
    scrollOffset: number,
  ) {
    this.metrics = metrics;
    this.lattice = { ...metrics, grids: metrics.months.map(buildMonthGrid) };
    const from = locateDate(this.lattice, date);
    if (!from) throw new Error("집어 든 날짜가 달력에 없어요.");
    this.from = from;
    this.primary = start;
    this.scrollOffset = this.startOffset = scrollOffset;
    this.drag = {
      leaveId,
      grabDate: date,
      hoverDate: date,
      deltaDays: 0,
      phase: "dragging",
      hasMoved: false,
    };
  }

  move(touches: readonly CalendarTouch[], maxOffset: number): void {
    this.primary =
      touches.find((touch) => touch.id === this.start.id) ?? this.primary;
    const secondary = this.secondary
      ? touches.find((touch) => touch.id === this.secondary?.id)
      : touches.find((touch) => touch.id !== this.start.id);
    if (secondary && this.secondary) {
      const dy = this.secondary.absoluteY - secondary.absoluteY;
      this.scrollOffset = Math.max(
        0,
        Math.min(maxOffset, this.scrollOffset + dy),
      );
      if (Math.abs(dy) > 0) this.moved = true;
    }
    this.secondary = secondary ?? null;
    if (
      Math.hypot(
        this.primary.absoluteX - this.start.absoluteX,
        this.primary.absoluteY - this.start.absoluteY,
      ) > MOVE_SLOP
    ) {
      this.moved = true;
    }
    this.updateHover();
    this.drag.hasMoved = this.moved;
  }

  release(ids: readonly number[]): "cancel" | "drop" | null {
    if (ids.includes(this.start.id)) return this.moved ? "drop" : "cancel";
    if (this.secondary && ids.includes(this.secondary.id))
      this.secondary = null;
    return null;
  }

  /** prepend 시 픽셀 원점이 밀린 만큼 시작점과 현재 오프셋을 함께 보정한다. */
  rebase(metrics: CalendarGridMetrics): boolean {
    if (
      metrics.itemHeight !== this.metrics.itemHeight ||
      metrics.rowPitch !== this.metrics.rowPitch ||
      metrics.colPitch !== this.metrics.colPitch ||
      metrics.labelHeight !== this.metrics.labelHeight ||
      metrics.months.length === 0
    )
      return false;
    const shift =
      monthNumber(this.metrics.months[0]!) - monthNumber(metrics.months[0]!);
    const pixels = shift * metrics.itemHeight;
    this.from = { ...this.from, monthIndex: this.from.monthIndex + shift };
    this.startOffset += pixels;
    this.scrollOffset += pixels;
    this.metrics = metrics;
    this.lattice = { ...metrics, grids: metrics.months.map(buildMonthGrid) };
    this.updateHover();
    return true;
  }

  private updateHover(): void {
    const hover = resolveDrop(
      this.lattice,
      this.from,
      this.primary.absoluteX - this.start.absoluteX,
      this.primary.absoluteY - this.start.absoluteY,
      this.scrollOffset - this.startOffset,
    );
    this.drag.hoverDate = hover;
    this.drag.deltaDays = hover ? diffDays(this.drag.grabDate, hover) : 0;
  }
}
