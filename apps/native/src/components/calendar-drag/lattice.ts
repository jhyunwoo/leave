/**
 * 달력 드래그의 좌표 계산 — "지금 손가락이 어느 날짜 칸 위인가".
 *
 * 사용처: components/calendar-drag/use-leave-chip-drag.ts.
 *
 * ## 왜 절대 좌표가 아니라 이동량(translation)인가
 *
 * 제스처가 알려주는 절대 좌표로 칸을 찾으려면 목록 루트의 화면 위치·스크롤
 * 오프셋·상단 인셋을 모두 알아야 하고, 그 값들이 안드로이드 edge-to-edge나 모달
 * 아래에서 서로 다른 기준계를 쓰는 순간 조용히 어긋난다.
 *
 * 대신 **집어 든 칸의 격자 좌표는 드래그가 시작되는 순간 칩 자신의 날짜에서 정확히
 * 알 수 있다.** 거기에 이동량만 더하면 되므로 필요한 것은 칸 간격뿐이다.
 * 드래그 중에는 목록 스크롤을 얼려 두므로 이 가정이 유지된다(calendar-scroll.tsx).
 *
 * 가장 가까운 격자점으로 반올림하는 것이 곧 "잡은 지점 기준 이동"이다 — 놓은 칸은
 * 집어 든 칸과 같은 칸 안 위치를 갖는다.
 */

/** 격자 한 칸이 담고 있는 것. `buildMonthGrid`(@leave/shared/calendar)의 GridCell. */
export type LatticeDay = { date: string; inMonth: boolean };

/** 달력 한 달치 격자 — 주 배열의 배열. */
export type LatticeGrid = readonly (readonly LatticeDay[])[];

/**
 * 드래그 한 번 동안 고정으로 쓰는 격자 정보.
 *
 * `grids`는 드래그 시작 시점의 **스냅샷**이어야 한다. 목록은 스크롤 중에 앞뒤로
 * 달을 이어 붙이고 꼬리를 잘라내므로(calendar-scroll.tsx의 capTail), 제스처 도중에
 * 살아 있는 배열을 다시 읽으면 인덱스가 밀린다.
 */
export type DragLattice = {
  /** 달 블록 하나의 높이(calendar-scroll의 monthBlockHeight). */
  itemHeight: number;
  /** 주 행 하나의 세로 간격 = 칸 높이 + 행 사이 여백. */
  rowPitch: number;
  /** 칸 하나의 가로 간격 = 칸 너비 + 칸 사이 여백. */
  colPitch: number;
  /** 달 이름 띠 높이. 격자는 그 아래에서 시작한다. */
  labelHeight: number;
  /** 목록에 담긴 달들의 격자. 달마다 4~6주로 길이가 다르다. */
  grids: readonly LatticeGrid[];
};

/** 격자 안의 한 칸. */
export type LatticeCell = {
  monthIndex: number;
  row: number;
  col: number;
};

/**
 * 이 날짜가 그려지는 칸. 달 밖 채움 칸이 아니라 **제 달 안의** 칸만 찾는다.
 * 목록에 없는 달이면 null.
 */
export function locateDate(
  lattice: DragLattice,
  date: string,
): LatticeCell | null {
  for (let monthIndex = 0; monthIndex < lattice.grids.length; monthIndex++) {
    const grid = lattice.grids[monthIndex]!;
    for (let row = 0; row < grid.length; row++) {
      const week = grid[row]!;
      for (let col = 0; col < week.length; col++) {
        const cell = week[col]!;
        if (cell.inMonth && cell.date === date) return { monthIndex, row, col };
      }
    }
  }
  return null;
}

/**
 * 집어 든 칸에서 이동량만큼 옮겼을 때 놓이는 날짜. 놓을 수 없는 자리면 null.
 *
 * null이 되는 자리들 —
 * - 달 블록 아래쪽에 남는 빈 주 칸. `buildMonthGrid`는 4~6주를 돌려주는데 블록은
 *   늘 6주 높이라 대부분의 달에 빈 슬롯이 남는다. 여기서 마지막 주로 끌어당기면
 *   휴가가 조용히 일주일 밀리므로, 놓을 자리가 아니라고 답한다.
 * - 앞뒤 달에서 넘어온 채움 칸(`inMonth === false`). 그 날짜는 제 달의 칸에서
 *   놓아야 한다.
 * - 목록에 담기지 않은 달.
 */
export function resolveDrop(
  lattice: DragLattice,
  from: LatticeCell,
  translationX: number,
  translationY: number,
): string | null {
  const { itemHeight, rowPitch, colPitch, labelHeight, grids } = lattice;
  if (rowPitch <= 0 || colPitch <= 0 || itemHeight <= 0) return null;

  // 가로로는 화면 밖으로 나갈 수 없으므로 가장 가까운 열로 붙인다. 미리보기가
  // 결과를 그대로 보여주므로 놀랄 일은 없다.
  const x = from.col * colPitch + translationX;
  const col = Math.min(6, Math.max(0, Math.round(x / colPitch)));

  const y =
    from.monthIndex * itemHeight +
    labelHeight +
    from.row * rowPitch +
    translationY;

  // 달 이름 띠 위에 걸친 지점은 앞뒤 두 달 모두 후보다. 행 격자에 더 가까운 쪽이
  // 이긴다 — 띠는 어느 쪽으로도 놓을 수 있는 중립 구간이 된다.
  const base = Math.floor((y - labelHeight) / itemHeight);
  let best: { monthIndex: number; row: number; error: number } | null = null;
  for (const monthIndex of [base, base + 1]) {
    if (monthIndex < 0 || monthIndex >= grids.length) continue;
    const raw = (y - monthIndex * itemHeight - labelHeight) / rowPitch;
    const row = Math.round(raw);
    if (row < 0 || row >= grids[monthIndex]!.length) continue;
    const error = Math.abs(raw - row);
    if (!best || error < best.error) best = { monthIndex, row, error };
  }
  if (!best) return null;

  const cell = grids[best.monthIndex]![best.row]![col];
  if (!cell || !cell.inMonth) return null;
  return cell.date;
}
