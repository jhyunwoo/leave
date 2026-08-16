/**
 * 하루의 출타 명단(웹).
 * 사용처: 달력의 하루 패널(DayPanel), 휴가 상세 페이지.
 */

import {
  BALANCE_LABELS,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  segmentBalanceKey,
  segmentOnDate,
} from "@leave/shared";
import type { Calendar } from "@leave/client";
import { fmtRange } from "@leave/shared";
import { Avatar } from "../Avatar";

/**
 * 하루의 출타 명단. 날짜 패널과 휴가 상세 페이지가 함께 쓴다.
 *
 * 명단에는 내 일정도 함께 들어 있다. 초안은 서버가 애초에 내려주지 않는다.
 */
export function DayRoster(props: {
  attendees: Calendar["attendees"];
  date: string;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
  /**
   * 내 계획 행을 눌러 그 휴가로 갈 수 있게 한다. 넘기지 않으면 명단은 읽기 전용이다.
   *
   * 옵트인인 이유: 휴가 상세 페이지도 이 명단을 쓰는데, 거기서는 이미 그 휴가를 보고
   * 있으므로 눌러 갈 곳이 없다. 남의 행은 어느 경우에도 눌리지 않는다 — 볼 상세가
   * 없고, 서버가 남의 휴가 제목·사유를 애초에 내려주지 않는다.
   */
  onOpenLeave?: (leaveId: string) => void;
}) {
  const { date } = props;
  const dayAttendees = props.attendees.filter(
    (a) => a.startDate <= date && date <= a.endDate,
  );

  if (dayAttendees.length === 0) {
    return (
      <div
        className="card-sage"
        style={{ textAlign: "center", padding: "var(--sp-2xl) var(--sp-lg)" }}
      >
        <p className="body-sm text-body">이 날 출타 예정인 사람이 없어요.</p>
        <p className="caption text-mute" style={{ marginTop: 4 }}>
          내 계획을 먼저 시뮬레이션해보세요.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}
    >
      <p className="body-sm strong">이 날 출타 {dayAttendees.length}명</p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-xs)",
        }}
      >
        {dayAttendees.map((attendee) => {
          // 날짜별 재원을 알 수 있으므로 그날 해당하는 재원만 보여준다.
          const segment = segmentOnDate(attendee.segments, date);
          const key = segment ? segmentBalanceKey(segment) : null;
          const isMine = attendee.userId === props.myUserId;
          const openLeave = isMine ? props.onOpenLeave : undefined;
          // 눌리는 행과 그냥 보는 행이 같은 크기여야 한다. 태그만 바뀌고 스타일은 같다.
          const RowTag = openLeave ? "button" : "div";
          return (
            <li key={attendee.leaveId} style={{ minWidth: 0 }}>
              <RowTag
                {...(openLeave
                  ? {
                      type: "button" as const,
                      onClick: () => openLeave(attendee.leaveId),
                      "aria-label": "내 계획 자세히 보기",
                    }
                  : {})}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-md)",
                  background: isMine
                    ? "var(--primary-pale, #e2f6d5)"
                    : "transparent",
                  borderRadius: "var(--r-lg)",
                  padding: "var(--sp-sm)",
                  minWidth: 0,
                  width: "100%",
                  border: "none",
                  font: "inherit",
                  color: "inherit",
                  textAlign: "left",
                  cursor: openLeave ? "pointer" : "default",
                }}
              >
                <Avatar name={attendee.name} size={32} />
                <div style={{ minWidth: 0 }}>
                  <p className="body-sm strong">
                    {isMine
                      ? "내 계획"
                      : `${attendee.rankLabel} ${attendee.name}`}
                    {key && (
                      <span
                        className="cal-mine"
                        data-balance={key}
                        style={{
                          display: "inline-block",
                          width: "auto",
                          margin: "0 0 0 6px",
                        }}
                      >
                        {BALANCE_LABELS[key]}
                      </span>
                    )}
                  </p>
                  <p className="caption text-mute">
                    {fmtRange(attendee.startDate, attendee.endDate)}
                    {isConfirmedLeaveStatus(attendee.status)
                      ? ""
                      : ` · ${LEAVE_STATUS_LABELS[attendee.status]}`}
                  </p>
                </div>
              </RowTag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
