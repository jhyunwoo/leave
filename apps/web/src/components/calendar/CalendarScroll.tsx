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
import { useCalendar } from "@leave/client";
import type { MyLeaveDay } from "@leave/client";
import { MonthCalendar } from "./MonthCalendar";
import "./calendar.css";

const INITIAL_SPAN = 2;
const PAGE_SIZE = 6;

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
export const CalendarScroll = forwardRef<
  CalendarScrollHandle,
  {
    unitId: string;
    selectedDate: string | null;
    onSelectDate: (date: string) => void;
    myLeaveDays: Map<string, MyLeaveDay>;
    regularOvernight: RegularOvernightConfig | null;
    currentCycle: RegularOvernightCycle | null;
  }
>(function CalendarScroll(
  {
    unitId,
    selectedDate,
    onSelectDate,
    myLeaveDays,
    regularOvernight,
    currentCycle,
  },
  ref,
) {
  const currentMonth = todayInSeoul().slice(0, 7);
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );
  const pageScroll = usePageScroll();

  const scrollRef = useRef<HTMLDivElement>(null);
  const weekdaysRef = useRef<HTMLDivElement>(null);
  const monthEls = useRef(new Map<string, HTMLElement>());
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  /**
   * prepend 시 스크롤 점프를 막기 위한 기준점 — 위에 달이 끼어들기 직전의
   * "이 요소가 화면 어디에 있었는가".
   *
   * 예전에는 직전 scrollHeight를 적어 두고 늘어난 만큼 밀었는데, 높이는 위로
   * 붙든 아래로 붙든 똑같이 늘어난다. 위아래 센티널이 한 번에 걸리면 아래로
   * 붙은 6개월까지 위에 낀 것으로 세어 3326px을 밀어 버렸다. 실제 요소를
   * 기준으로 재면 아래에서 무슨 일이 나든 영향을 받지 않는다.
   */
  const prependAnchor = useRef<{ el: HTMLElement; top: number } | null>(null);
  const didInitialScroll = useRef(false);

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
      const anchor = prependAnchor.current;
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

  // prepend 후 스크롤 위치 보정. 안 하면 새 달이 삽입된 만큼 화면이 아래로
  // 튀어, 보고 있던 날짜가 사라진 것처럼 보인다.
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (anchor == null) return;
    prependAnchor.current = null;
    // 기준 요소가 화면에서 밀려난 만큼만 되민다.
    const delta = anchor.el.getBoundingClientRect().top - anchor.top;
    if (delta === 0) return;
    if (pageScroll) {
      window.scrollBy(0, delta);
      return;
    }
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop += delta;
  }, [months, pageScroll]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === topSentinel.current && didInitialScroll.current) {
            // 첫 달 블록은 prepend 뒤에도 같은 DOM 노드로 남는다(key가 달 문자열).
            const firstBlock =
              scroller.querySelector<HTMLElement>(".cal-month-block");
            if (firstBlock)
              prependAnchor.current = {
                el: firstBlock,
                top: firstBlock.getBoundingClientRect().top,
              };
            setMonths((ms) => {
              const first = ms[0]!;
              const older: string[] = [];
              for (let i = PAGE_SIZE; i >= 1; i--)
                older.push(shiftMonth(first, -i));
              return [...older, ...ms];
            });
          } else if (e.target === bottomSentinel.current) {
            setMonths((ms) => {
              const last = ms[ms.length - 1]!;
              const newer: string[] = [];
              for (let i = 1; i <= PAGE_SIZE; i++)
                newer.push(shiftMonth(last, i));
              return [...ms, ...newer];
            });
          }
        }
      },
      // 스크롤포트가 바뀌면 관찰 기준도 함께 바뀌어야 한다(페이지는 null).
      { root: pageScroll ? null : scroller, rootMargin: "600px" },
    );
    if (topSentinel.current) io.observe(topSentinel.current);
    if (bottomSentinel.current) io.observe(bottomSentinel.current);
    return () => io.disconnect();
  }, [pageScroll]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToToday: () => scrollToMonth(currentMonth, "smooth"),
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
            className={`cal-weekday ${i === 0 ? "is-sunday" : ""}`}
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
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              myLeaveDays={myLeaveDays}
              regularOvernight={regularOvernight}
              currentCycle={currentCycle}
            />
          </section>
        ))}
        <div ref={bottomSentinel} className="cal-sentinel" aria-hidden="true" />
      </div>
    </div>
  );
});

function MonthBlock(props: {
  unitId: string;
  month: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  myLeaveDays: Map<string, MyLeaveDay>;
  regularOvernight: RegularOvernightConfig | null;
  currentCycle: RegularOvernightCycle | null;
}) {
  const calendar = useCalendar(props.unitId, props.month);
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
    />
  );
}
