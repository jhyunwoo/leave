/**
 * 달력 옆 칸을 통째로 차지하는 내 휴가 한 건의 정보 창(넓은 화면 전용).
 *
 * 수정은 모달이 아니라 이 창 안에서 연다. 달력이 옆에 그대로 보여야 날짜를
 * 옮길 때 그 주변이 어떤지 눈으로 확인할 수 있다.
 */

import { useDeleteLeave, type MyLeave } from "@leave/client";
import {
  BALANCE_LABELS,
  fmtRange,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  segmentBalanceKey,
} from "@leave/shared";
import { useState } from "react";
import { Link } from "react-router";
import { ActionIcon } from "../ActionIcon";
import { LazyLeaveForm, preloadLeaveFormModal } from "../LazyLeaveFormModal";

export function LeaveSidePanel(props: {
  leave: MyLeave;
  onBack: () => void;
  /** 저장하다 붙은 휴가에 흡수되면 창이 가리킬 휴가가 바뀐다. */
  onReplaced: (leaveId: string) => void;
}) {
  const { leave } = props;
  const del = useDeleteLeave();
  const [editing, setEditing] = useState(false);

  return (
    <section
      className="card anim-rise"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ alignSelf: "flex-start" }}
        onClick={props.onBack}
      >
        ‹ 날짜 상세
      </button>

      {editing ? (
        <>
          <h2 className="display-xs">휴가 수정</h2>
          <LazyLeaveForm
            editing={leave}
            onClose={() => setEditing(false)}
            onSaved={(result) => {
              if (result.leave.id !== leave.id)
                props.onReplaced(result.leave.id);
            }}
          />
        </>
      ) : (
        <>
          <div>
            <h2 className="display-xs">{leave.title}</h2>
            <p className="body-sm text-body" style={{ marginTop: 4 }}>
              {fmtRange(leave.startDate, leave.endDate)}
            </p>
            <p className="caption text-mute" style={{ marginTop: 4 }}>
              복귀 예정 {leave.returnTime}
            </p>
            {leave.reason && (
              <p className="caption text-mute" style={{ marginTop: 4 }}>
                {leave.reason}
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {!isConfirmedLeaveStatus(leave.status) && (
              <span className="badge">{LEAVE_STATUS_LABELS[leave.status]}</span>
            )}
            {leave.segments.map((segment) => {
              const key = segmentBalanceKey(segment);
              return (
                <span key={`${key}-${segment.startDate}`} className="badge">
                  {BALANCE_LABELS[key]}{" "}
                  {fmtRangeTiny(segment.startDate, segment.endDate)}
                </span>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onMouseEnter={preloadLeaveFormModal}
              onFocus={preloadLeaveFormModal}
              onClick={() => setEditing(true)}
            >
              <ActionIcon name="edit" />
              수정
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={del.isPending}
              onClick={() => {
                if (!confirm(`"${leave.title}" 휴가를 삭제할까요?`)) return;
                void del
                  .mutateAsync(leave.id)
                  .then(props.onBack, () =>
                    alert("삭제하지 못했어요. 잠시 후 다시 시도해주세요."),
                  );
              }}
            >
              <ActionIcon name="trash" />
              삭제
            </button>
          </div>

          {/* 기간 안의 초과일·날짜별 명단은 상세 페이지에만 있다. */}
          <Link to={`/leaves/${leave.id}`} className="caption text-mute">
            초과일·명단까지 자세히 보기
          </Link>
        </>
      )}
    </section>
  );
}
