/**
 * SNS 공유용 "이번 달 내 휴가" 이미지의 배치.
 *
 * 사용처: 웹 내 휴가의 공유(캔버스로 그린다), 앱 내 휴가의 공유(react-native-svg로 그린다).
 *
 * 그림을 직접 만들지 않고 사각형·글자 목록만 돌려준다. 두 플랫폼이 그리는 방법은 달라도
 * 좌표를 한곳에서 정해야 같은 이미지가 나온다. 글자의 y는 기준선(baseline)이다 —
 * 캔버스의 `alphabetic`과 SVG `<text>`의 기본값이 같은 뜻이다.
 */

import { buildMonthGrid, splitMonth, WEEKDAYS } from "./calendar";
import { eachDate, type ISODate } from "./dates";
import { isHoliday } from "./holidays";
import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  isCountedLeaveStatus,
  segmentBalanceKey,
  type BalanceKey,
  type LeaveSegment,
} from "./leave";

export const SHARE_CARD_WIDTH = 1080;
/** 인스타그램 피드 세로형(4:5). 스토리에 올려도 위아래 여백만 생긴다. */
export const SHARE_CARD_HEIGHT = 1350;

export type ShareRect = {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: string;
};

export type ShareText = {
  kind: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  weight: 600 | 700 | 900;
  fill: string;
  anchor: "start" | "middle" | "end";
};

export type ShareShape = ShareRect | ShareText;

export type ShareLeave = {
  id: string;
  title: string;
  status: string;
  segments: readonly (Pick<
    LeaveSegment,
    "category" | "overnightKind" | "outingKind" | "startDate" | "endDate"
  > & { overnightKind?: LeaveSegment["overnightKind"] | null })[];
};

/**
 * 재원별 막대 색. 앱 라이트 테마(apps/native/src/theme.ts의 lightBalance)·웹 달력
 * (calendar.css의 `.cal-mine`)과 같은 쌍이다 — 공유 이미지는 다크 모드와 무관하게
 * 밝은 바탕으로 나가므로 라이트 값만 둔다.
 */
export const SHARE_BALANCE_COLORS: Record<
  BalanceKey,
  { fg: string; bg: string }
> = {
  annual: { fg: "#1f5e10", bg: "#d8f3c4" },
  award: { fg: "#8a4b00", bg: "#ffe8c7" },
  compensation: { fg: "#4c2c9c", bg: "#e6ddff" },
  consolation: { fg: "#9c1d55", bg: "#ffdcea" },
  petition: { fg: "#0b5c55", bg: "#c9efeb" },
  sick: { fg: "#a72027", bg: "#ffdcdd" },
  regular_overnight: { fg: "#12439c", bg: "#d8e6ff" },
  other_overnight: { fg: "#065b7a", bg: "#cdeaf6" },
  outing: { fg: "#454745", bg: "#e4e7e2" },
  weekend_outing: { fg: "#3f4668", bg: "#e0e3f0" },
  other: { fg: "#5a5c59", bg: "#eceee9" },
};

const INK = "#0e0f0c";
const INK_DEEP = "#163300";
const BODY = "#454745";
const RED = "#c4262e";
const CANVAS = "#ffffff";
const BACKDROP = "#e2f6d5";
const ACCENT = "#9fe870";

/**
 * 공유 이미지에 넣는 휴가인가. 부대원에게 보이는 상태(출타 집계 대상)만 넣는다 —
 * 초안은 나만 보는 시뮬레이션이고, 반려·취소는 실제로 나가지 않는다.
 */
export function isShareableLeave(leave: Pick<ShareLeave, "status">): boolean {
  return isCountedLeaveStatus(leave.status);
}

/** 공유 화면을 처음 열 때 보여줄 달: 가장 가까운 다가오는 휴가의 달, 없으면 이번 달. */
export function defaultShareMonth(
  leaves: readonly (ShareLeave & { startDate: ISODate; endDate: ISODate })[],
  today: ISODate,
): string {
  const next = leaves
    .filter((leave) => isShareableLeave(leave) && leave.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (!next) return today.slice(0, 7);
  return next.startDate < today
    ? today.slice(0, 7)
    : next.startDate.slice(0, 7);
}

type DayMark = { leaveId: string; title: string; key: BalanceKey };

/** 그 달의 날짜마다 어떤 휴가의 어떤 재원인지. 휴가는 서로 겹칠 수 없어 하루에 하나다. */
function marksFor(
  month: string,
  leaves: readonly ShareLeave[],
): Map<ISODate, DayMark> {
  const marks = new Map<ISODate, DayMark>();
  for (const leave of leaves) {
    if (!isShareableLeave(leave)) continue;
    for (const segment of leave.segments) {
      const key = segmentBalanceKey({
        category: segment.category,
        overnightKind: segment.overnightKind ?? undefined,
        outingKind: segment.outingKind ?? undefined,
      });
      for (const date of eachDate(segment.startDate, segment.endDate)) {
        if (date.slice(0, 7) !== month) continue;
        marks.set(date, { leaveId: leave.id, title: leave.title, key });
      }
    }
  }
  return marks;
}

/**
 * 폭에 맞게 글자를 자른다. 글꼴을 재지 않고 어림한다 — 한글은 글자 크기만큼,
 * 그 밖은 0.6배로 잡으면 실제 폭보다 약간 넉넉해 넘치지 않는다.
 */
export function fitShareText(text: string, maxWidth: number, size: number) {
  const widthOf = (value: string) =>
    [...value].reduce(
      (sum, char) => sum + (/[ㄱ-힝]/.test(char) ? size : size * 0.6),
      0,
    );
  if (widthOf(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 0 && widthOf(chars.join("") + "…") > maxWidth) {
    chars.pop();
  }
  return chars.length ? chars.join("") + "…" : "";
}

export type ShareCard = {
  width: number;
  height: number;
  shapes: ShareShape[];
  /** 이 달에 나가는 날 수. 0이면 공유할 것이 없다. */
  outDays: number;
};

export function buildLeaveShareCard(input: {
  month: string;
  leaves: readonly ShareLeave[];
}): ShareCard {
  const { month } = input;
  const { year, monthNum } = splitMonth(month);
  const marks = marksFor(month, input.leaves);
  const shapes: ShareShape[] = [];
  const rect = (r: Omit<ShareRect, "kind">) =>
    shapes.push({ kind: "rect", ...r });
  const text = (t: Omit<ShareText, "kind">) =>
    shapes.push({ kind: "text", ...t });

  rect({
    x: 0,
    y: 0,
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    radius: 0,
    fill: BACKDROP,
  });

  // 머리: 연도, 그리고 굵은 "N월 휴가". 굵은 숫자가 앱 디자인의 얼굴이라 그대로 가져온다.
  text({
    x: 64,
    y: 132,
    text: `${year}`,
    size: 40,
    weight: 700,
    fill: INK_DEEP,
    anchor: "start",
  });
  text({
    x: 60,
    y: 248,
    text: `${monthNum}월 휴가`,
    size: 112,
    weight: 900,
    fill: INK,
    anchor: "start",
  });
  // 유일한 강조색: 이 달에 나가는 날 수.
  const outDays = marks.size;
  if (outDays > 0) {
    const label = `${outDays}일 나가요`;
    const pillWidth = 56 + [...label].length * 34;
    rect({
      x: SHARE_CARD_WIDTH - 64 - pillWidth,
      y: 168,
      width: pillWidth,
      height: 92,
      radius: 46,
      fill: ACCENT,
    });
    text({
      x: SHARE_CARD_WIDTH - 64 - pillWidth / 2,
      y: 228,
      text: label,
      size: 40,
      weight: 900,
      fill: INK,
      anchor: "middle",
    });
  }

  // 달력 카드.
  const weeks = buildMonthGrid(month);
  const cardX = 48;
  const cardY = 312;
  const cardWidth = SHARE_CARD_WIDTH - cardX * 2;
  const gridX = cardX + 20;
  const cellWidth = (cardWidth - 40) / 7;
  const headerHeight = 84;
  // 5주짜리 달도 6주짜리와 같은 카드 높이를 쓴다. 줄어든 만큼 아래가 비면 어색하다.
  const cellHeight = (6 * 112) / weeks.length;
  const cardHeight = headerHeight + weeks.length * cellHeight + 20;
  rect({
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    radius: 40,
    fill: CANVAS,
  });
  WEEKDAYS.forEach((label, col) => {
    text({
      x: gridX + col * cellWidth + cellWidth / 2,
      y: cardY + 58,
      text: label,
      size: 28,
      weight: 700,
      fill: col === 0 ? RED : BODY,
      anchor: "middle",
    });
  });

  const titled = new Set<string>();
  weeks.forEach((week, row) => {
    const top = cardY + headerHeight + row * cellHeight;
    // 같은 휴가·같은 재원이 이어지는 날은 막대 하나로 그린다.
    let col = 0;
    while (col < 7) {
      const cell = week[col]!;
      const mark = cell.inMonth ? marks.get(cell.date) : undefined;
      if (!mark) {
        col += 1;
        continue;
      }
      let end = col;
      while (end + 1 < 7) {
        const next = week[end + 1]!;
        const nextMark = next.inMonth ? marks.get(next.date) : undefined;
        if (nextMark?.leaveId !== mark.leaveId || nextMark.key !== mark.key) {
          break;
        }
        end += 1;
      }
      const color = SHARE_BALANCE_COLORS[mark.key];
      const x = gridX + col * cellWidth + 4;
      const width = (end - col + 1) * cellWidth - 8;
      rect({ x, y: top + 54, width, height: 52, radius: 14, fill: color.bg });
      // 제목은 휴가마다 처음 나오는 막대에만 적는다. 이어지는 막대는 색이 말해 준다.
      if (!titled.has(mark.leaveId)) {
        titled.add(mark.leaveId);
        const label = fitShareText(mark.title, width - 28, 26);
        if (label) {
          text({
            x: x + 14,
            y: top + 89,
            text: label,
            size: 26,
            weight: 700,
            fill: color.fg,
            anchor: "start",
          });
        }
      }
      col = end + 1;
    }
    week.forEach((cell, index) => {
      if (!cell.inMonth) return;
      const red = index === 0 || isHoliday(cell.date);
      text({
        x: gridX + index * cellWidth + 16,
        y: top + 40,
        text: String(Number(cell.date.slice(8))),
        size: 30,
        weight: 600,
        fill: red ? RED : INK,
        anchor: "start",
      });
    });
  });

  // 범례: 이 달에 나온 재원만, 재원 순서대로.
  const used = new Set([...marks.values()].map((mark) => mark.key));
  let chipX = 64;
  let chipY = cardY + cardHeight + 36;
  for (const key of BALANCE_KEYS) {
    if (!used.has(key)) continue;
    const label = BALANCE_LABELS[key];
    const width = 40 + [...label].length * 28;
    if (chipX + width > SHARE_CARD_WIDTH - 64) {
      chipX = 64;
      chipY += 64;
    }
    const color = SHARE_BALANCE_COLORS[key];
    rect({ x: chipX, y: chipY, width, height: 52, radius: 26, fill: color.bg });
    text({
      x: chipX + width / 2,
      y: chipY + 36,
      text: label,
      size: 26,
      weight: 700,
      fill: color.fg,
      anchor: "middle",
    });
    chipX += width + 12;
  }

  // 바닥: 앱 이름과 주소. 로고 그림 대신 이름을 글자로 적는다.
  const footerY = SHARE_CARD_HEIGHT - 56;
  text({
    x: 64,
    y: footerY,
    text: "리브",
    size: 40,
    weight: 900,
    fill: INK,
    anchor: "start",
  });
  text({
    x: SHARE_CARD_WIDTH - 64,
    y: footerY,
    text: "leave.moveto.kr",
    size: 28,
    weight: 600,
    fill: BODY,
    anchor: "end",
  });

  return {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    shapes,
    outDays,
  };
}
