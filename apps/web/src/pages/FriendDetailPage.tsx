import { useFriendSchedule, useFriends } from "@leave/client";
import { fmtRange, monthBounds, shiftMonth, todayInSeoul } from "@leave/shared";
import { Link, Navigate, useNavigate, useParams } from "react-router";

export function FriendDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const friends = useFriends();
  const navigate = useNavigate();
  const current = todayInSeoul().slice(0, 7);
  const range = {
    startDate: monthBounds(shiftMonth(current, -1)).start,
    endDate: monthBounds(shiftMonth(current, 5)).end,
  };
  const schedule = useFriendSchedule(
    userId ?? null,
    range.startDate,
    range.endDate,
  );
  if (!userId) return <Navigate to="/friends" replace />;
  const friend = friends.data?.friends.find((row) => row.userId === userId);
  return (
    <div
      className="anim-rise"
      style={{
        padding: "var(--sp-xl) 0 var(--sp-3xl)",
        display: "grid",
        gap: "var(--sp-lg)",
      }}
    >
      <header>
        <Link to="/friends" className="caption">
          ← 친구 목록
        </Link>
        <h1 className="display-md" style={{ marginTop: "var(--sp-sm)" }}>
          {friend?.name ?? "친구 일정"}
        </h1>
      </header>
      <div>
        <button
          className="btn btn-primary"
          onClick={() => void navigate(`/?mode=friends&friends=${userId}`)}
        >
          내 달력과 비교
        </button>
      </div>
      <section
        className="card"
        style={{
          padding: "var(--sp-xl)",
          display: "grid",
          gap: "var(--sp-md)",
        }}
      >
        <h2 className="display-xs">공유된 휴가 일정</h2>
        {schedule.isPending ? (
          <div className="spinner" aria-label="일정 불러오는 중" />
        ) : schedule.isError ? (
          <p role="alert" className="field-error">
            일정을 볼 수 없어요. 친구 관계나 차단 상태를 확인해주세요.
          </p>
        ) : schedule.data?.leaves.length ? (
          schedule.data.leaves.map((leave) => (
            <div
              key={leave.leaveId}
              style={{
                padding: "var(--sp-md)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--r-md)",
              }}
            >
              <strong>{fmtRange(leave.startDate, leave.endDate)}</strong>
              <p className="caption text-mute">공유된 휴가 · {leave.status}</p>
            </div>
          ))
        ) : (
          <p className="text-body">이 기간에 공유된 휴가가 없어요.</p>
        )}
      </section>
    </div>
  );
}
