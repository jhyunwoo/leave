/**
 * 달력에서 끌어 옮긴 휴가를 미리 보여주고, 놓이면 저장한다.
 *
 * 사용처: screens/calendar/index.tsx.
 *
 * 제스처(components/calendar-drag)는 "어느 휴가를 며칠 옮기는 중"까지만 안다.
 * 휴가 목록과 저장을 쥔 쪽은 달력 화면이므로, 겹침 판정·미리보기·저장은 여기서 한다.
 */

import { fmtRange } from "@leave/shared/calendar";
import type { ISODate } from "@leave/shared/dates";
import { segmentsRange, shiftSegments } from "@leave/shared/leave";
import { planLeaveMerge } from "@leave/shared/leave-merge";
import { leaveCreateSchema } from "@leave/shared/schemas";
import { onlineManager } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import {
  buildMyLeaveDayMap,
  useUpdateLeave,
  type MyLeave,
} from "@leave/client";
import { confirmAction, notify } from "@/lib/dialog";
import {
  calendarDragAtom,
  calendarDragPreviewAtom,
  type LeaveDragDay,
  type LeaveDragVerdict,
} from "@/state/calendar-drag";

/**
 * 옮긴 뒤의 모습과 그게 저장될 수 있는지.
 *
 * 겹침만은 서버가 저장할 때 돌리는 것과 **같은 함수**(`planLeaveMerge`)로 미리 알 수
 * 있어 놓기 전에 막는다. 적립분 부족·정기외박 주기 초과는 적립 배분을 통째로 다시
 * 계산해야 알 수 있어 여기서 예측하지 않고 서버 응답으로 처리한다.
 */
function planMove(
  leave: MyLeave,
  leaves: readonly MyLeave[],
  deltaDays: number,
): { segments: MyLeave["segments"]; verdict: LeaveDragVerdict } {
  const segments = shiftSegments(leave.segments, deltaDays);
  const plan = planLeaveMerge({ ...leave, segments }, leaves);
  return {
    segments,
    verdict:
      plan.kind === "conflict"
        ? "conflict"
        : plan.kind === "merged"
          ? "merge"
          : "ok",
  };
}

export function useLeaveDrag(
  leaves: readonly MyLeave[] | undefined,
  onEdit: (leave: MyLeave) => void,
): {
  /** 지금 휴가를 끌고 있는지. */
  isDragging: boolean;
  /** 끄는 동안 머리말 줄에 대신 띄울 안내. 드래그가 없으면 null. */
  statusLabel: string | null;
} {
  const drag = useAtomValue(calendarDragAtom);
  const setDrag = useSetAtom(calendarDragAtom);
  const setPreview = useSetAtom(calendarDragPreviewAtom);
  const updateLeave = useUpdateLeave();
  const committing = useRef(false);

  const leave = useMemo(
    () =>
      drag ? (leaves?.find((it) => it.id === drag.leaveId) ?? null) : null,
    [drag, leaves],
  );

  const moved = useMemo(() => {
    if (!drag || !leave || drag.hoverDate == null) return null;
    return planMove(leave, leaves ?? [], drag.deltaDays);
  }, [drag, leave, leaves]);

  // 덧그릴 칸들. 저장된 칸과 똑같이 생기도록 같은 함수로 만든다.
  useEffect(() => {
    if (!drag || !leave) {
      setPreview(null);
      return;
    }
    const map = new Map<ISODate, LeaveDragDay>();
    const badge = {
      verdict: moved?.verdict ?? "ok",
      phase: drag.phase,
    } as const;
    // 출발 위치와 옮길 위치를 함께 보여준다.
    for (const [date, day] of buildMyLeaveDayMap([leave])) {
      map.set(date, { ...day, role: "origin", ...badge });
    }
    if (moved) {
      for (const [date, day] of buildMyLeaveDayMap([
        { ...leave, segments: moved.segments },
      ])) {
        map.set(date, { ...day, role: "target", ...badge });
      }
    }
    setPreview(map);
  }, [drag, leave, moved, setPreview]);

  useEffect(() => () => setPreview(null), [setPreview]);

  // 손을 뗐다. 여기서 실제로 저장한다.
  useEffect(() => {
    if (
      !drag ||
      (drag.phase !== "dropped" && drag.phase !== "editing") ||
      committing.current
    )
      return;
    committing.current = true;

    void (async () => {
      try {
        if (drag.phase === "editing") {
          if (
            leave &&
            (await confirmAction({
              title: "휴가 편집",
              message: `"${leave.title}" 휴가의 일정과 내용을 편집할까요?`,
              confirmLabel: "편집",
            }))
          )
            onEdit(leave);
          return;
        }
        if (
          !leave ||
          !moved ||
          drag.hoverDate == null ||
          drag.deltaDays === 0
        ) {
          return;
        }
        if (moved.verdict === "conflict") {
          notify(
            "기간이 겹쳐요",
            "그 자리에 이미 등록한 휴가가 있어요. 다른 날짜로 옮겨주세요.",
          );
          return;
        }
        // 오프라인에서는 시도조차 하지 않는다. 이 앱의 mutation은 networkMode가
        // 기본값("online")이라 연결이 없으면 영영 끝나지 않고 멈춰 서고,
        // 그러면 미리보기가 "저장 중"인 채로 굳는다.
        if (!onlineManager.isOnline()) {
          notify(
            "오프라인이라 옮길 수 없어요",
            "연결된 뒤에 다시 시도해주세요.",
          );
          return;
        }

        const range = segmentsRange(moved.segments);
        if (leave.status === "approved" && range) {
          const before = segmentsRange(leave.segments);
          const ok = await confirmAction({
            title: "확정된 휴가예요",
            message: `${before ? `${fmtRange(before.startDate, before.endDate)} → ` : ""}${fmtRange(range.startDate, range.endDate)}로 옮길까요?`,
            confirmLabel: "옮기기",
          });
          if (!ok) return;
        }

        setDrag((current) =>
          current ? { ...current, phase: "saving" } : current,
        );
        await updateLeave.mutateAsync({
          id: leave.id,
          // 저장된 구간은 서버가 계산한 days를 달고 있는데 입력 스키마는 그걸
          // 받지 않는다. 폼과 같은 방식으로 스키마를 통과시켜 벗겨 낸다.
          input: leaveCreateSchema.parse({
            title: leave.title,
            status: leave.status,
            segments: moved.segments,
            ...(leave.reason ? { reason: leave.reason } : {}),
          }),
        });
      } catch (error) {
        notify(
          "옮기지 못했어요",
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        );
      } finally {
        committing.current = false;
        setDrag(null);
      }
    })();
  }, [drag, leave, moved, setDrag, updateLeave, onEdit]);

  const statusLabel = useMemo(() => {
    if (!drag) return null;
    if (drag.phase === "saving") return "옮기는 중…";
    if (drag.hoverDate == null) return "달력 안의 날짜에 놓아주세요";
    if (drag.phase === "editing") return "휴가 편집";
    if (drag.deltaDays === 0)
      return drag.hasMoved
        ? "옮길 날짜로 끌어주세요"
        : "놓으면 편집 · 다른 손가락으로 월 이동";
    if (moved?.verdict === "conflict") return "겹치는 휴가가 있어요";
    const range = moved ? segmentsRange(moved.segments) : null;
    if (!range) return null;
    const label = fmtRange(range.startDate, range.endDate);
    return moved?.verdict === "merge"
      ? `${label} · 앞뒤 휴가와 합쳐져요`
      : `${label}로 옮기기`;
  }, [drag, moved]);

  return { isDragging: drag !== null, statusLabel };
}
