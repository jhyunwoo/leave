/** 내 휴가 목록에서 제목·기간을 건드리지 않고 진행 상태만 빠르게 바꾼다. */

import type { MyLeave } from "@leave/client";
import { useUpdateLeaveStatus } from "@leave/client";
import {
  isUserEditableLeaveStatus,
  LEAVE_STATUS_LABELS,
  USER_EDITABLE_LEAVE_STATUSES,
  type UserEditableLeaveStatus,
} from "@leave/shared";
import { useState } from "react";

const QUICK_STATUS_LABELS: Record<UserEditableLeaveStatus, string> = {
  draft: "초안",
  shared: "희망",
  requested: "신청함",
  approved: "확정",
};

export function LeaveStatusControl(props: { leave: MyLeave }) {
  const updateStatus = useUpdateLeaveStatus();
  const [error, setError] = useState<string | null>(null);
  const { leave } = props;
  const editableStatus = isUserEditableLeaveStatus(leave.status)
    ? leave.status
    : null;

  const changeStatus = async (status: UserEditableLeaveStatus) => {
    if (
      editableStatus === null ||
      updateStatus.isPending ||
      status === editableStatus
    ) {
      return;
    }

    setError(null);
    try {
      await updateStatus.mutateAsync({ id: leave.id, status });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "상태를 변경하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    }
  };

  return (
    <div className="leave-status-control">
      <div className="leave-status-control__header">
        <p
          className="caption strong"
          aria-live="polite"
          data-testid={`leave-status-current-${leave.id}`}
        >
          상태 · {LEAVE_STATUS_LABELS[leave.status]}
        </p>
        {updateStatus.isPending && (
          <span className="caption text-mute" role="status">
            변경 중…
          </span>
        )}
      </div>

      {editableStatus !== null ? (
        <div
          className="leave-status-options"
          role="group"
          aria-label={`${leave.title} 휴가 상태 변경`}
          data-testid={`leave-status-control-${leave.id}`}
        >
          {USER_EDITABLE_LEAVE_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="leave-status-option"
              aria-pressed={status === editableStatus}
              disabled={updateStatus.isPending}
              onClick={() => void changeStatus(status)}
            >
              {QUICK_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      ) : (
        <p className="caption text-mute">
          종료된 상태예요. 수정에서 다시 변경할 수 있어요.
        </p>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
