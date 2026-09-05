/**
 * 꾹 눌러 드래그로 순서를 바꿀 때의 자리 계산.
 *
 * 사용처: 휴가 종류 목록(`segment-reorder-list.tsx`).
 *
 * 제스처와 떼어 놓은 이유는 테스트 때문이다 — 어느 자리로 떨어지는가는 규칙이고,
 * 그 규칙이 틀리면 사용자가 잡은 것과 다른 구간이 움직인다. 달력 칩 드래그도
 * 같은 이유로 격자 계산을 `calendar-drag/lattice.ts`로 떼어 놨다.
 *
 * 행 높이가 제각각이다(휴가 종류 선택기를 펴면 그 행만 커진다). 그래서 "이동 거리 ÷
 * 행 높이"로는 안 되고, 지나온 행의 실제 높이를 하나씩 까 나가야 한다.
 *
 * 둘 다 `"worklet"`이다 — 손가락을 따라 매 프레임 도는 계산이라 UI 스레드에서
 * 실행돼야 한다. 순수 함수라 테스트에서는 그냥 부르면 된다.
 */

/**
 * `from` 자리의 행을 `dy`만큼 끌었을 때 놓이는 자리.
 *
 * 이웃 행의 **절반**을 넘어야 자리를 넘겨준다. 그래야 경계에서 두 자리를 왔다
 * 갔다 하지 않는다.
 */
export function reorderTargetIndex(
  heights: readonly number[],
  from: number,
  dy: number,
): number {
  "worklet";
  if (from < 0 || from >= heights.length) return from;

  let index = from;
  let remaining = dy;

  // 방향은 하나뿐이다. 두 방향을 이어서 돌리면, 아래로 한 칸 넘어가느라
  // 음수가 된 나머지를 위쪽 루프가 다시 읽어 제자리로 되돌린다.
  if (dy > 0) {
    while (index < heights.length - 1) {
      const next = heights[index + 1] ?? 0;
      if (remaining < next / 2) break;
      remaining -= next;
      index += 1;
    }
  } else if (dy < 0) {
    while (index > 0) {
      const previous = heights[index - 1] ?? 0;
      if (-remaining < previous / 2) break;
      remaining += previous;
      index -= 1;
    }
  }
  return index;
}

/**
 * 드래그 중 제자리에 남은 행이 비켜서야 할 거리.
 *
 * 잡힌 행이 빠져나간 만큼 사이의 행들이 그 자리를 메운다. 잡힌 행 자체와
 * 구간 밖의 행은 움직이지 않는다.
 */
export function shiftForIndex(
  index: number,
  activeIndex: number,
  targetIndex: number,
  activeHeight: number,
): number {
  "worklet";
  if (index === activeIndex) return 0;
  if (activeIndex < index && index <= targetIndex) return -activeHeight;
  if (targetIndex <= index && index < activeIndex) return activeHeight;
  return 0;
}
