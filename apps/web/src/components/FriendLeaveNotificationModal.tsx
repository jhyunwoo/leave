import {
  useNotificationLeaveDetails,
  type FriendLeaveNotification,
} from "@leave/client";
import { fmtRange, isConfirmedLeaveStatus } from "@leave/shared";
import { Modal } from "./Modal";

export function FriendLeaveNotificationModal(props: {
  target: FriendLeaveNotification;
  date?: string;
  onClose: () => void;
}) {
  const detail = useNotificationLeaveDetails(props.target, props.date);
  return (
    <Modal title="친구 휴가 일정" onClose={props.onClose}>
      <div style={{ display: "grid", gap: "var(--sp-lg)" }}>
        <p className="body-sm text-body">
          {fmtRange(props.target.startDate, props.target.endDate)}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            className="btn btn-secondary btn-sm"
            aria-label="이전 날짜"
            disabled={!detail.canPrevious}
            onClick={detail.previous}
          >
            이전
          </button>
          <strong>{detail.date}</strong>
          <button
            className="btn btn-secondary btn-sm"
            aria-label="다음 날짜"
            disabled={!detail.canNext}
            onClick={detail.next}
          >
            다음
          </button>
        </div>
        {detail.loading ? (
          <p role="status">일정을 불러오는 중…</p>
        ) : detail.message ? (
          <div role="status">
            <p>{detail.message}</p>
            <button
              className="btn btn-secondary"
              onClick={() => void detail.retry()}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <section
              className="content-panel"
              style={{ padding: "var(--sp-md)" }}
            >
              <h3 className="body-lg strong">{detail.friendName}님의 휴가</h3>
              {detail.friendLeaves.length ? (
                detail.friendLeaves.map((leave) => (
                  <p
                    key={leave.leaveId}
                    className="body-sm"
                    style={{ marginTop: "var(--sp-sm)" }}
                  >
                    {fmtRange(leave.startDate, leave.endDate)} ·{" "}
                    {isConfirmedLeaveStatus(leave.status)
                      ? "확정 휴가"
                      : "공유 휴가"}
                  </p>
                ))
              ) : (
                <p>이 날짜에는 친구의 공유 휴가가 없어요.</p>
              )}
            </section>
            <section
              className="content-panel"
              style={{ padding: "var(--sp-md)" }}
            >
              <h3 className="body-lg strong">나의 휴가</h3>
              {detail.myLeaves.length ? (
                detail.myLeaves.map((leave) => (
                  <div key={leave.id} style={{ marginTop: "var(--sp-sm)" }}>
                    <p className="body-sm strong">{leave.title}</p>
                    <p className="body-sm text-body">
                      {fmtRange(leave.startDate, leave.endDate)}
                    </p>
                  </div>
                ))
              ) : (
                <p>이 날짜에는 내 휴가가 없어요.</p>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
