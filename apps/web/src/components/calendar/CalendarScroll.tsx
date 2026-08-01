import {
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
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCalendar } from "../../api/queries";
import type { MyLeaveDay } from "../../lib/my-leave-days";
import { MonthCalendar } from "./MonthCalendar";
import "./calendar.css";

const INITIAL_SPAN = 2;
const PAGE_SIZE = 6;

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
    enlistedAt: string;
    currentCycle: RegularOvernightCycle | null;
  }
>(function CalendarScroll(
  {
    unitId,
    selectedDate,
    onSelectDate,
    myLeaveDays,
    regularOvernight,
    enlistedAt,
    currentCycle,
  },
  ref,
) {
  const currentMonth = todayInSeoul().slice(0, 7);
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const monthEls = useRef(new Map<string, HTMLElement>());
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  // prepend 시 스크롤 점프를 막기 위해 직전 scrollHeight를 기록한다.
  const prependAnchor = useRef<number | null>(null);
  const didInitialScroll = useRef(false);

  const scrollToMonth = (month: string, behavior: ScrollBehavior) => {
    const el = monthEls.current.get(month);
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    const headerH = headerRef.current?.offsetHeight ?? 0;
    scroller.scrollTo({ top: el.offsetTop - headerH - 8, behavior });
  };

  // 최초 렌더에서 현재 달로 위치를 맞춘다.
  useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    if (monthEls.current.has(currentMonth)) {
      scrollToMonth(currentMonth, "auto");
      didInitialScroll.current = true;
    }
  });

  // prepend 후 스크롤 위치 보정.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (prependAnchor.current != null && scroller) {
      scroller.scrollTop += scroller.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    }
  }, [months]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === topSentinel.current && didInitialScroll.current) {
            prependAnchor.current = scroller.scrollHeight;
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
      { root: scroller, rootMargin: "600px" },
    );
    if (topSentinel.current) io.observe(topSentinel.current);
    if (bottomSentinel.current) io.observe(bottomSentinel.current);
    return () => io.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => scrollToMonth(currentMonth, "smooth"),
  }));

  return (
    <div className="cal-scroll-shell">
      <div
        className="cal-weekdays cal-weekdays-sticky"
        ref={headerRef}
        role="row"
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
              enlistedAt={enlistedAt}
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
  enlistedAt: string;
  currentCycle: RegularOvernightCycle | null;
}) {
  const calendar = useCalendar(props.unitId, props.month);
  const cycles = useMemo(() => {
    const { start, end } = monthBounds(props.month);
    return cyclesInRange(props.regularOvernight, start, end, props.enlistedAt);
  }, [props.month, props.regularOvernight, props.enlistedAt]);

  if (calendar.isPending) {
    return (
      <div className="cal-month-loading">
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
