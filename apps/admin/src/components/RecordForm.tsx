/**
 * 관리자 생성·편집 폼 — 리소스를 골라 그에 맞는 입력을 그린다.
 *
 * 사용처: EntityPage의 상세 서랍(생성/편집 모드).
 *
 * 여기 남긴 것은 리소스마다 다르지 않은 부분뿐이다.
 *  - 어떤 폼을 그릴지 고르는 분기
 *  - 제출 시 FormData를 서버 본문으로 바꾸는 호출
 *  - 오류 표시와 취소·저장 버튼
 *
 * 리소스별 입력은 ./record-form/*Fields.tsx, 서버로 보낼 본문은
 * ./record-form/payloads.ts에 있다. 분기를 표(맵)로 감추지 않고 switch로 두는 이유는
 * 새 리소스를 붙일 때 "무엇을 더 만들어야 하는지"가 컴파일 오류로 드러나게 하려는 것이다.
 */

import {
  fitDrafts,
  resolveDrafts,
  segmentsToDrafts,
  type LeaveSegment,
  type SegmentDraft,
} from "@leave/shared";
import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { InitialRecord } from "./record-form/fields";
import { AdminFields } from "./record-form/AdminFields";
import { LeaveFields } from "./record-form/LeaveFields";
import { NotificationFields } from "./record-form/NotificationFields";
import {
  adminPayload,
  leavePayload,
  notificationPayload,
  unitPayload,
  userPayload,
  type FormMode,
  type RecordPayload,
} from "./record-form/payloads";
import { UnitFields } from "./record-form/UnitFields";
import { UserFields } from "./record-form/UserFields";
import { initialString } from "./record-form/fields";

export type EditableResource =
  "users" | "units" | "leaves" | "notifications" | "admins";

type Props = {
  resource: EditableResource;
  mode: FormMode;
  initial?: InitialRecord;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: RecordPayload) => void;
};

function initialSegments(initial: InitialRecord | undefined): LeaveSegment[] {
  return Array.isArray(initial?.segments)
    ? (initial.segments as LeaveSegment[])
    : [];
}

export function RecordForm({
  resource,
  mode,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: Props) {
  // 휴가·알림에서 "함께 발송할지"를 묻는 체크박스. 폼 데이터가 아니라 동작 선택이라
  // FormData가 아닌 상태로 다룬다.
  const [alsoSend, setAlsoSend] = useState(false);

  // 휴가는 "구간"의 나열로 저장하므로 이 부분만 제어 컴포넌트다. 자세한 배경은
  // record-form/LeaveFields.tsx.
  const [leaveStart, setLeaveStart] = useState(() =>
    initialString(initial, "startDate"),
  );
  const [leaveEnd, setLeaveEnd] = useState(() =>
    initialString(initial, "endDate"),
  );
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() => {
    const segments = initialSegments(initial);
    return segments.length
      ? segmentsToDrafts(segments)
      : fitDrafts(
          [],
          initialString(initial, "startDate"),
          initialString(initial, "endDate"),
        );
  });

  const leaveRangeValid = Boolean(
    leaveStart && leaveEnd && leaveStart <= leaveEnd,
  );
  const resolvedDrafts = leaveRangeValid
    ? resolveDrafts(leaveStart, drafts)
    : [];

  /** 기간이 바뀌면 구간을 다시 맞춰 항상 전체를 덮게 한다. */
  const applyLeaveRange = (nextStart: string, nextEnd: string) => {
    setLeaveStart(nextStart);
    setLeaveEnd(nextEnd);
    setDrafts((current) => fitDrafts(current, nextStart, nextEnd));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    switch (resource) {
      case "users":
        onSubmit(userPayload(form, mode));
        break;
      case "units":
        onSubmit(unitPayload(form, mode));
        break;
      case "leaves":
        onSubmit(leavePayload(form, leaveStart, drafts, alsoSend));
        break;
      case "notifications":
        onSubmit(notificationPayload(form, mode, alsoSend));
        break;
      case "admins":
        onSubmit(adminPayload(form, mode));
        break;
    }
  };

  return (
    <form className="record-form" onSubmit={submit}>
      {resource === "users" ? (
        <UserFields mode={mode} initial={initial} />
      ) : null}
      {resource === "units" ? (
        <UnitFields mode={mode} initial={initial} />
      ) : null}
      {resource === "leaves" ? (
        <LeaveFields
          initial={initial}
          leaveStart={leaveStart}
          leaveEnd={leaveEnd}
          onRangeChange={applyLeaveRange}
          resolvedDrafts={resolvedDrafts}
          onDraftsChange={setDrafts}
          sendNotifications={alsoSend}
          onSendNotificationsChange={setAlsoSend}
        />
      ) : null}
      {resource === "notifications" ? (
        <NotificationFields
          mode={mode}
          initial={initial}
          sendPush={alsoSend}
          onSendPushChange={setAlsoSend}
        />
      ) : null}
      {resource === "admins" ? (
        <AdminFields mode={mode} initial={initial} />
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-actions">
        <button className="button secondary" type="button" onClick={onCancel}>
          취소
        </button>
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={17} /> : null}
          {mode === "create" ? "생성" : "변경 저장"}
        </button>
      </div>
    </form>
  );
}
