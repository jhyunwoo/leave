/**
 * SNS 공유용 "이번 달 내 휴가" 이미지의 배치.
 *
 * 사용처: 웹 내 휴가의 공유(캔버스로 그린다), 앱 내 휴가의 공유(react-native-svg로 그린다).
 *
 * 그림을 직접 만들지 않고 사각형·글자 목록만 돌려준다. 두 플랫폼이 그리는 방법은 달라도
 * 좌표를 한곳에서 정해야 같은 이미지가 나온다. 글자의 y는 기준선(baseline)이다 —
 * 캔버스의 `alphabetic`과 SVG `<text>`의 기본값이 같은 뜻이다.
 */

import {
  buildMonthGrid,
  fmtDateTiny,
  fmtRangeTiny,
  splitMonth,
  WEEKDAYS,
} from "./calendar";
import { eachDate, type ISODate } from "./dates";
import { isHoliday } from "./holidays";
import { isCountedLeaveStatus, type LeaveSegment } from "./leave";

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
  status: string;
  segments: readonly Pick<LeaveSegment, "category" | "startDate" | "endDate">[];
};

/**
 * 이미지는 재원(연가·포상·외박…)을 가르지 않고 "휴가" 하나로 칠한다. 보는 사람에게는
 * 언제 나가는지가 중요하고, 재원은 내 사정이다. 외출만은 하루 안에 돌아오는 것이라
 * 휴가와 섞이면 오해를 사므로 따로 칠하고, 넣을지는 사용자가 고른다.
 */
export type ShareKind = "leave" | "outing";

export const SHARE_KIND_COLORS: Record<ShareKind, { fg: string; bg: string }> =
  {
    leave: { fg: "#163300", bg: "#9fe870" },
    outing: { fg: "#454745", bg: "#e4e7e2" },
  };

const SHARE_KIND_LABELS: Record<ShareKind, string> = {
  leave: "휴가",
  outing: "외출",
};

/**
 * 고를 수 있는 이미지 바탕. 달력 카드는 늘 흰색이라 바탕은 머리·바닥 글자의 색만
 * 함께 정하면 된다. 밝은 색은 앱 재원 팔레트에서 가져와 앱과 같은 톤을 유지한다.
 */
export const SHARE_BACKGROUNDS = [
  {
    id: "green",
    label: "연두",
    fill: "#e2f6d5",
    ink: "#0e0f0c",
    sub: "#454745",
  },
  { id: "sky", label: "하늘", fill: "#d8e6ff", ink: "#0e0f0c", sub: "#454745" },
  {
    id: "pink",
    label: "분홍",
    fill: "#ffdcea",
    ink: "#0e0f0c",
    sub: "#454745",
  },
  {
    id: "peach",
    label: "살구",
    fill: "#ffe8c7",
    ink: "#0e0f0c",
    sub: "#454745",
  },
  {
    id: "lavender",
    label: "보라",
    fill: "#e6ddff",
    ink: "#0e0f0c",
    sub: "#454745",
  },
  {
    id: "black",
    label: "검정",
    fill: "#0e0f0c",
    ink: "#ffffff",
    sub: "#c8cbc4",
  },
] as const;

export type ShareBackgroundId = (typeof SHARE_BACKGROUNDS)[number]["id"];

const INK = "#0e0f0c";
const BODY = "#454745";
const RED = "#c4262e";
const CANVAS = "#ffffff";

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

/** 휴가 하나 안에서 같은 갈래(휴가/외출)인 날들. 막대를 잇고 기간 글자를 다는 단위다. */
type ShareRun = { kind: ShareKind; label: string; shortLabel: string };

/**
 * 그 달의 날짜마다 어떤 묶음에 속하는지. 휴가는 서로 겹칠 수 없어 하루에 하나다.
 * 묶음의 기간은 달로 자르지 않는다 — 9/29에 시작한 휴가는 10월 이미지에서도 "9/29–10/2"다.
 */
function marksFor(
  month: string,
  leaves: readonly ShareLeave[],
  showOutings: boolean,
): Map<ISODate, ShareRun> {
  const marks = new Map<ISODate, ShareRun>();
  for (const leave of leaves) {
    if (!isShareableLeave(leave)) continue;
    for (const kind of ["leave", "outing"] as const) {
      if (kind === "outing" && !showOutings) continue;
      const segments = leave.segments.filter(
        (segment) => (segment.category === "outing") === (kind === "outing"),
      );
      if (segments.length === 0) continue;
      const start = segments.reduce(
        (min, segment) => (segment.startDate < min ? segment.startDate : min),
        segments[0]!.startDate,
      );
      const end = segments.reduce(
        (max, segment) => (segment.endDate > max ? segment.endDate : max),
        segments[0]!.endDate,
      );
      const run: ShareRun = {
        kind,
        label: fmtRangeTiny(start, end),
        // 한 칸짜리 막대(토|일로 갈린 외박 등)에는 "10/3–10/4"가 안 들어간다.
        shortLabel:
          start === end
            ? fmtDateTiny(start)
            : start.slice(0, 7) === end.slice(0, 7)
              ? `${Number(start.slice(8))}–${Number(end.slice(8))}일`
              : fmtRangeTiny(start, end),
      };
      for (const segment of segments) {
        for (const date of eachDate(segment.startDate, segment.endDate)) {
          if (date.slice(0, 7) === month) marks.set(date, run);
        }
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
  background: ShareBackgroundId;
  showOutings: boolean;
}): ShareCard {
  const { month } = input;
  const { year, monthNum } = splitMonth(month);
  const marks = marksFor(month, input.leaves, input.showOutings);
  const backdrop =
    SHARE_BACKGROUNDS.find((option) => option.id === input.background) ??
    SHARE_BACKGROUNDS[0];
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
    fill: backdrop.fill,
  });

  // 머리: 연도, 그리고 굵은 "N월 휴가". 굵은 숫자가 앱 디자인의 얼굴이라 그대로 가져온다.
  text({
    x: 64,
    y: 132,
    text: `${year}`,
    size: 40,
    weight: 700,
    fill: backdrop.ink,
    anchor: "start",
  });
  text({
    x: 60,
    y: 248,
    text: `${monthNum}월 휴가`,
    size: 112,
    weight: 900,
    fill: backdrop.ink,
    anchor: "start",
  });

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

  // 기간 글자는 묶음마다 가장 넓은 막대 하나에만 단다. 나머지 막대는 색이 말해 준다.
  const labelSlots = new Map<
    ShareRun,
    { x: number; y: number; width: number }
  >();
  weeks.forEach((week, row) => {
    const top = cardY + headerHeight + row * cellHeight;
    // 같은 묶음이 이어지는 날은 막대 하나로 그린다.
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
        if ((next.inMonth ? marks.get(next.date) : undefined) !== mark) break;
        end += 1;
      }
      const x = gridX + col * cellWidth + 4;
      const width = (end - col + 1) * cellWidth - 8;
      rect({
        x,
        y: top + 54,
        width,
        height: 52,
        radius: 14,
        fill: SHARE_KIND_COLORS[mark.kind].bg,
      });
      const slot = labelSlots.get(mark);
      if (!slot || width > slot.width) {
        labelSlots.set(mark, { x, y: top + 89, width });
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

  for (const [run, slot] of labelSlots) {
    // 왼쪽을 날짜 숫자와 같은 선(칸 +16)에 맞추고, 오른쪽은 그보다 조금 좁게 둔다.
    const room = slot.width - 22;
    const label =
      fitShareText(run.label, room, 26) === run.label
        ? run.label
        : fitShareText(run.shortLabel, room, 26);
    if (!label) continue;
    text({
      x: slot.x + 12,
      y: slot.y,
      text: label,
      size: 26,
      weight: 700,
      fill: SHARE_KIND_COLORS[run.kind].fg,
      anchor: "start",
    });
  }

  // 범례: 외출이 함께 있을 때만 둔다. 휴가만 있으면 제목이 이미 "N월 휴가"다.
  const used = new Set([...marks.values()].map((mark) => mark.kind));
  let chipX = 64;
  const chipY = cardY + cardHeight + 36;
  for (const key of used.has("outing") ? (["leave", "outing"] as const) : []) {
    if (!used.has(key)) continue;
    const label = SHARE_KIND_LABELS[key];
    const width = 40 + [...label].length * 28;
    const color = SHARE_KIND_COLORS[key];
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
    fill: backdrop.ink,
    anchor: "start",
  });
  text({
    x: SHARE_CARD_WIDTH - 64,
    y: footerY,
    text: "leave.moveto.kr",
    size: 28,
    weight: 600,
    fill: backdrop.sub,
    anchor: "end",
  });

  return {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    shapes,
    outDays: marks.size,
  };
}
