/**
 * 무한 스크롤 달력 — 여러 달을 이어 붙이고 스크롤에 따라 앞뒤로 더 불러온다.
 *
 * 사용처: apps/web/src/pages/CalendarPage.tsx.
 *
 * 위쪽으로 달을 덧붙일 때는 스크롤 위치를 보정해야 한다. 안 하면 새 달이 삽입된
 * 만큼 화면이 아래로 튀어, 보고 있던 날짜가 사라진 것처럼 보인다.
 *
 * 스크롤포트는 화면 폭에 따라 둘 중 하나다. 넓으면 안쪽 `.cal-scroll` 박스가,
 * 좁으면 페이지 자체가 스크롤한다(`usePageScroll`). 모바일에서 박스를 쓰면
 * 손가락이 달력 위에 있는 동안 페이지가 멈춰 갇힌 것처럼 느껴진다. 대신 어느
 * 쪽이 스크롤하느냐에 따라 세 곳이 갈린다 — 관찰자의 root, 달로 이동하는 좌표
 * 계산, prepend 보정. 여기서 갈리지 않은 게 있으면 조용히 어긋난다.
 */

import {
  buildMonthGrid,
  CALENDAR_QUERY_FUTURE_MONTHS,
  CALENDAR_QUERY_PAST_MONTHS,
  cyclesInRange,
  monthBounds,
  shiftMonth,
  splitMonth,
  todayInSeoul,
  WEEKDAYS,
  type RegularOvernightConfig,
  type RegularOvernightCycle,
} from "@leave/shared";
import {
  forwardRef,
  memo,
  type CSSProperties,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCalendar, usePersonalEvents } from "@leave/client";
import type { MyLeaveDay } from "@leave/client";
import { MonthCalendar } from "./MonthCalendar";
import "./calendar.css";

const INITIAL_SPAN = 2;
export const CALENDAR_PAGE_SIZE = 3;
export const CALENDAR_MAX_MONTHS = 9;

/**
 * 좁은 화면에서는 페이지가 달력의 스크롤포트가 된다. 기준은 CalendarPage가
 * 하루 패널을 아래로 내리는 폭과 같다 — 패널이 옆에 붙어 있는 동안에는 달력
 * 높이가 묶여 있어야 하지만, 아래로 쌓이고 나면 묶어 둘 이유가 없다.
 */
const PAGE_SCROLL_QUERY = "(max-width: 900px)";

function subscribeToPageScroll(onChange: () => void) {
  const mql = window.matchMedia(PAGE_SCROLL_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function usePageScroll(): boolean {
  return useSyncExternalStore(
    subscribeToPageScroll,
    () => window.matchMedia(PAGE_SCROLL_QUERY).matches,
    () => false,
  );
}

function monthRange(center: string, span: number): string[] {
  const out: string[] = [];
  for (let i = -span; i <= span; i++) out.push(shiftMonth(center, i));
  return out;
}

export type CalendarWindowDirection = "older" | "newer";
export interface CalendarWindowBounds {
  earliestMonth: string;
  latestMonth: string;
}

/**
 * Move the mounted month window in one direction while retaining the edge
 * nearest the viewport. The transition is pure so its contiguous-month and
 * maximum-size invariants can be tested independently of IntersectionObserver.
 * A final partial batch stops at the API bounds; at the absolute edge the
 * original array is returned so React and the observer do no extra work.
 */
export function transitionCalendarWindow(
  months: string[],
  direction: CalendarWindowDirection,
  bounds: CalendarWindowBounds,
): string[] {
  if (months.length === 0) return [];

  if (direction === "older") {
    const first = months[0];
    if (!first) return [];
    const older = Array.from({ length: CALENDAR_PAGE_SIZE }, (_, index) =>
      shiftMonth(first, index - CALENDAR_PAGE_SIZE),
    ).filter((month) => month >= bounds.earliestMonth);
    if (older.length === 0) return months;
    return [...older, ...months].slice(0, CALENDAR_MAX_MONTHS);
  }

  const last = months[months.length - 1];
  if (!last) return [];
  const newer = Array.from({ length: CALENDAR_PAGE_SIZE }, (_, index) =>
    shiftMonth(last, index + 1),
  ).filter((month) => month <= bounds.latestMonth);
  if (newer.length === 0) return months;
  return [...months, ...newer].slice(-CALENDAR_MAX_MONTHS);
}

function monthLabel(month: string): string {
  const { year, monthNum } = splitMonth(month);
  return `${year}년 ${monthNum}월`;
}

export interface CalendarScrollHandle {
  scrollToToday: () => void;
}

/**
 * iOS 기본 캘린더식 세로 무한 스크롤. 여러 달을 세로로 쌓아 자유롭게 스크롤하며,
 * 위·아래 끝에 가까워지면 이전/다음 달을 이어 붙인다. 요일 헤더는 상단에 고정.
 */
const CalendarScrollImpl = forwardRef<
  CalendarScrollHandle,
  {
    unitId: string;
    selectedDate: string | null;
    onSelectDate: (date: string) => void;
    myLeaveDays: Map<string, MyLeaveDay>;
    regularOvernight: RegularOvernightConfig | null;
    currentCycle: RegularOvernightCycle | null;
    /** 내 전역일. 그날 칸에 배지를 달고, 다음 날부터는 주기 표시를 멈춘다. */
    dischargeAt: string | null;
  }
>(function CalendarScroll(
  {
    unitId,
    selectedDate,
    onSelectDate,
    myLeaveDays,
    regularOvernight,
    currentCycle,
    dischargeAt,
  },
  ref,
) {
  const currentMonth = todayInSeoul().slice(0, 7);
  const earliestMonth = shiftMonth(currentMonth, -CALENDAR_QUERY_PAST_MONTHS);
  const latestMonth = shiftMonth(currentMonth, CALENDAR_QUERY_FUTURE_MONTHS);
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );
  const pageScroll = usePageScroll();

  const scrollRef = useRef<HTMLDivElement>(null);
  const weekdaysRef = useRef<HTMLDivElement>(null);
  const monthEls = useRef(new Map<string, HTMLElement>());
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const monthsRef = useRef(months);
  const transitionPending = useRef(false);
  const edgeIntersecting = useRef({ older: false, newer: false });
  const pendingScroll = useRef<{
    month: string;
    behavior: ScrollBehavior;
  } | null>(null);
  const pendingFocusHandoff = useRef<{
    month: string;
    dayIndex: number;
  } | null>(null);
  const onSelectDateRef = useRef(onSelectDate);
  /**
   * prepend 시 스크롤 점프를 막기 위한 기준점 — 위에 달이 끼어들기 직전의
   * "이 요소가 화면 어디에 있었는가".
   *
   * 예전에는 직전 scrollHeight를 적어 두고 늘어난 만큼 밀었는데, 높이는 위로
   * 붙든 아래로 붙든 똑같이 늘어난다. 위아래 센티널이 한 번에 걸리면 아래로
   * 붙은 6개월까지 위에 낀 것으로 세어 3326px을 밀어 버렸다. 실제 요소를
   * 기준으로 재면 아래에서 무슨 일이 나든 영향을 받지 않는다.
   */
  const scrollAnchor = useRef<{ el: HTMLElement; top: number } | null>(null);
  const didInitialScroll = useRef(false);

  useLayoutEffect(() => {
    onSelectDateRef.current = onSelectDate;
  }, [onSelectDate]);

  const handleSelectDate = useCallback((date: string) => {
    onSelectDateRef.current(date);
  }, []);

  /**
   * 페이지 모드에서 달을 세울 높이. 요일 줄이 붙는 위치(= 상단 내비 높이)에
   * 요일 줄 자신의 높이를 더한 값이다. CSS에서 값을 읽어 오므로 내비 높이를
   * JS에 한 번 더 적어 두지 않아도 된다.
   */
  const stickyOffset = useCallback(() => {
    const weekdays = weekdaysRef.current;
    if (!weekdays) return 0;
    const top = Number.parseFloat(getComputedStyle(weekdays).top);
    return (Number.isFinite(top) ? top : 0) + weekdays.offsetHeight;
  }, []);

  const scrollToMonth = useCallback(
    (month: string, behavior: ScrollBehavior) => {
      const el = monthEls.current.get(month);
      if (!el) return;
      if (pageScroll) {
        // 고정 헤더 높이를 빼지 않으면 목표 달이 그 뒤로 숨는다.
        const top =
          window.scrollY + el.getBoundingClientRect().top - stickyOffset();
        // 페이지 모드에서는 부드러운 스크롤을 쓰지 않는다. 애니메이션이 도는
        // 동안 달이 앞뒤로 덧붙고 그때마다 위치 보정이 window를 다시 스크롤해,
        // 진행 중이던 애니메이션이 취소되고 엉뚱한 자리에 멈춘다. 실제로
        // "오늘"이 목표에서 655px 어긋난 채 끝났다. 즉시 이동은 문서가 흔들려도
        // 정확히 도착한다.
        window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      } else {
        const scroller = scrollRef.current;
        if (!scroller) return;
        // offsetTop은 더 바깥 조상을 기준으로 잡힐 수 있다. 현재 스크롤 위치와
        // 두 요소의 실제 화면 좌표 차이를 합쳐 컨테이너 내부 좌표로 환산한다.
        const top =
          scroller.scrollTop +
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top;
        scroller.scrollTo({ top: Math.max(0, top), behavior });
      }
      // 아직 처리되지 않은 prepend 기준점이 있으면 지금 자리로 다시 잡는다.
      // "오늘"을 누르려면 화면 위쪽으로 올라와야 하고, 그러면 위쪽 센티널이
      // 걸려 prepend가 예약된다. 그 기준점은 이 이동 전에 잰 값이라, 그대로
      // 두면 보정이 방금 한 이동까지 되돌려 버린다(실측 1129px 어긋남).
      // 끼어든 달만큼만 보정하도록 기준을 갱신한다.
      const anchor = scrollAnchor.current;
      if (anchor) anchor.top = anchor.el.getBoundingClientRect().top;
    },
    [pageScroll, stickyOffset],
  );

  // 최초 렌더에서 현재 달로 위치를 맞춘다.
  useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    if (monthEls.current.has(currentMonth)) {
      scrollToMonth(currentMonth, "auto");
      didInitialScroll.current = true;
    }
  });

  // Restore an explicitly requested month after a reset, or preserve a retained
  // edge month's visual position after the bounded window moves.
  useLayoutEffect(() => {
    monthsRef.current = months;

    const requestedScroll = pendingScroll.current;
    if (requestedScroll && monthEls.current.has(requestedScroll.month)) {
      pendingScroll.current = null;
      scrollAnchor.current = null;
      pendingFocusHandoff.current = null;
      scrollToMonth(requestedScroll.month, requestedScroll.behavior);
      transitionPending.current = false;
      return;
    }

    const anchor = scrollAnchor.current;
    scrollAnchor.current = null;
    if (anchor) {
      // Move by exactly the amount the retained DOM node moved. This handles
      // both prepending/pruning the end and appending/pruning the start.
      const delta = anchor.el.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) >= 1) {
        if (pageScroll) {
          window.scrollBy(0, delta);
        } else {
          const scroller = scrollRef.current;
          if (scroller) scroller.scrollTop += delta;
        }
      }
    }

    const focusHandoff = pendingFocusHandoff.current;
    pendingFocusHandoff.current = null;
    if (focusHandoff) {
      const targetMonth = monthEls.current.get(focusHandoff.month);
      const dateCells = targetMonth?.querySelectorAll<HTMLButtonElement>(
        ".cal-cell:not(:disabled)",
      );
      const targetCell =
        dateCells?.[
          Math.min(focusHandoff.dayIndex, Math.max(dateCells.length - 1, 0))
        ];

      if (targetCell) {
        targetCell.focus({ preventScroll: true });
      } else if (targetMonth) {
        // A retained month can still be loading on a slow connection. Its
        // section is a meaningful temporary target until normal Tab navigation
        // reaches loaded date cells; -1 keeps it out of the tab sequence.
        targetMonth.tabIndex = -1;
        targetMonth.focus({ preventScroll: true });
        targetMonth.addEventListener(
          "blur",
          () => targetMonth.removeAttribute("tabindex"),
          { once: true },
        );
      }
    }

    transitionPending.current = false;
  }, [months, pageScroll, scrollToMonth]);

  const requestWindowTransition = useCallback(
    (direction: CalendarWindowDirection) => {
      if (transitionPending.current) return;

      const previousMonths = monthsRef.current;
      const nextMonths = transitionCalendarWindow(previousMonths, direction, {
        earliestMonth,
        latestMonth,
      });
      if (nextMonths.length === 0 || nextMonths === previousMonths) return;

      const activeElement = document.activeElement;
      const focusedMonth =
        activeElement instanceof HTMLElement
          ? previousMonths.find((month) =>
              monthEls.current.get(month)?.contains(activeElement),
            )
          : undefined;
      if (
        activeElement instanceof HTMLElement &&
        focusedMonth &&
        !nextMonths.includes(focusedMonth)
      ) {
        const focusedMonthEl = monthEls.current.get(focusedMonth);
        const focusedDateCells = focusedMonthEl?.querySelectorAll(
          ".cal-cell:not(:disabled)",
        );
        const dayIndex = focusedDateCells
          ? Array.from(focusedDateCells).indexOf(activeElement)
          : -1;
        const targetMonth =
          direction === "older"
            ? nextMonths[nextMonths.length - 1]
            : nextMonths[0];
        if (targetMonth) {
          // A previous handoff may currently be on a still-loading section.
          // Carry that focus forward too, defaulting to the first available day.
          pendingFocusHandoff.current = {
            month: targetMonth,
            dayIndex: Math.max(dayIndex, 0),
          };
        }
      }

      // The old first month survives an older transition; the old last month
      // survives a newer transition. At the corresponding boundary that is the
      // visible retained node whose screen position must not move.
      const anchorMonth =
        direction === "older"
          ? previousMonths[0]
          : previousMonths[previousMonths.length - 1];
      const anchorEl = anchorMonth
        ? monthEls.current.get(anchorMonth)
        : undefined;
      scrollAnchor.current = anchorEl
        ? { el: anchorEl, top: anchorEl.getBoundingClientRect().top }
        : null;

      transitionPending.current = true;
      setMonths(nextMonths);
    },
    [earliestMonth, latestMonth],
  );

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const io = new IntersectionObserver(
      (entries) => {
        let requestOlder = false;
        let requestNewer = false;

        for (const e of entries) {
          if (e.target === topSentinel.current) {
            if (!e.isIntersecting) {
              edgeIntersecting.current.older = false;
            } else if (
              didInitialScroll.current &&
              !edgeIntersecting.current.older
            ) {
              edgeIntersecting.current.older = true;
              requestOlder = true;
            }
          } else if (e.target === bottomSentinel.current) {
            if (!e.isIntersecting) {
              edgeIntersecting.current.newer = false;
            } else if (!edgeIntersecting.current.newer) {
              edgeIntersecting.current.newer = true;
              requestNewer = true;
            }
          }
        }

        if (transitionPending.current || (!requestOlder && !requestNewer)) {
          return;
        }

        let direction: CalendarWindowDirection;
        if (requestOlder && requestNewer) {
          // Very tall viewports can expose both sentinels in one delivery. Pick
          // only the edge closest to its viewport boundary so callbacks cannot
          // enqueue conflicting window mutations.
          const viewport = pageScroll
            ? { top: 0, bottom: window.innerHeight }
            : scroller.getBoundingClientRect();
          const topDistance = Math.abs(
            (topSentinel.current?.getBoundingClientRect().bottom ?? 0) -
              viewport.top,
          );
          const bottomDistance = Math.abs(
            (bottomSentinel.current?.getBoundingClientRect().top ?? 0) -
              viewport.bottom,
          );
          direction = topDistance <= bottomDistance ? "older" : "newer";
        } else {
          direction = requestOlder ? "older" : "newer";
        }

        requestWindowTransition(direction);
      },
      // 스크롤포트가 바뀌면 관찰 기준도 함께 바뀌어야 한다(페이지는 null).
      { root: pageScroll ? null : scroller, rootMargin: "600px" },
    );
    if (topSentinel.current) io.observe(topSentinel.current);
    if (bottomSentinel.current) io.observe(bottomSentinel.current);
    return () => io.disconnect();
  }, [pageScroll, requestWindowTransition]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToToday: () => {
        if (monthEls.current.has(currentMonth)) {
          scrollToMonth(currentMonth, "smooth");
          return;
        }

        // The bounded window may have pruned today. Restore the original
        // five-month window, then scroll after those month refs have committed.
        pendingScroll.current = {
          month: currentMonth,
          // Resetting replaces most mounted DOM. An immediate jump avoids an
          // in-progress animation exposing a boundary and extending the fresh
          // window before it reaches today.
          behavior: "auto",
        };
        scrollAnchor.current = null;
        transitionPending.current = true;
        edgeIntersecting.current = { older: false, newer: false };
        setMonths(monthRange(currentMonth, INITIAL_SPAN));
      },
    }),
    [currentMonth, scrollToMonth],
  );

  return (
    <div className={`cal-scroll-shell${pageScroll ? " is-page-scroll" : ""}`}>
      <div
        className="cal-weekdays cal-weekdays-sticky"
        role="row"
        ref={weekdaysRef}
      >
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            role="columnheader"
            className={`cal-weekday ${i === 0 || i === 6 ? "is-red" : ""}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="cal-scroll" ref={scrollRef}>
        <div ref={topSentinel} className="cal-sentinel" aria-hidden="true" />
        {months.map((m) => (
          <section
            key={m}
            className="cal-month-block"
            ref={(el) => {
              if (el) monthEls.current.set(m, el);
              else monthEls.current.delete(m);
            }}
          >
            <h3 className="cal-month-label">{monthLabel(m)}</h3>
            <MonthBlock
              unitId={unitId}
              month={m}
              selectedDate={
                selectedDate?.slice(0, 7) === m ? selectedDate : null
              }
              onSelectDate={handleSelectDate}
              myLeaveDays={myLeaveDays}
              regularOvernight={regularOvernight}
              currentCycle={currentCycle}
              dischargeAt={dischargeAt}
            />
          </section>
        ))}
        <div ref={bottomSentinel} className="cal-sentinel" aria-hidden="true" />
      </div>
    </div>
  );
});

export const CalendarScroll = memo(CalendarScrollImpl);

const MonthBlock = memo(function MonthBlock(props: {
  unitId: string;
  month: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  myLeaveDays: Map<string, MyLeaveDay>;
  regularOvernight: RegularOvernightConfig | null;
  currentCycle: RegularOvernightCycle | null;
  dischargeAt: string | null;
}) {
  const calendar = useCalendar(props.unitId, props.month);
  const personalEvents = usePersonalEvents(props.month);
  const cycles = useMemo(() => {
    const { start, end } = monthBounds(props.month);
    return cyclesInRange(props.regularOvernight, start, end);
  }, [props.month, props.regularOvernight]);

  if (calendar.isPending) {
    return (
      <div
        className="cal-month-loading"
        // 이 달이 몇 주짜리인지는 데이터 없이도 안다. 자리표시자를 실제 높이로
        // 잡아 둬야 불러오기가 끝나는 순간 달이 줄면서 화면이 딸려 오지 않는다.
        style={
          {
            "--cal-rows": buildMonthGrid(props.month).length,
          } as CSSProperties
        }
      >
        <div className="spinner" aria-label="불러오는 중" />
      </div>
    );
  }
  if (calendar.isError || !calendar.data) {
    return <p className="cal-month-error">이 달을 불러오지 못했어요.</p>;
  }
  return (
    <MonthCalendar
      calendar={calendar.data}
      selectedDate={props.selectedDate}
      onSelectDate={props.onSelectDate}
      hideWeekdays
      myLeaveDays={props.myLeaveDays}
      cycles={cycles}
      currentCycle={props.currentCycle}
      dischargeAt={props.dischargeAt}
      personalEvents={personalEvents.data?.events}
    />
  );
});
