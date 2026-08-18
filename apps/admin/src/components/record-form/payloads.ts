/**
 * 폼 입력 → 서버에 보낼 본문.
 *
 * 사용처: record-form/ 아래 리소스별 폼.
 *
 * 화면(JSX)에서 떼어 둔 이유는 이 부분이 서버 계약이기 때문이다. 어떤 키를 보내고
 * 생성·수정에서 무엇이 달라지는지는 worker/routes/*.ts의 zod 스키마와 짝이 맞아야
 * 하고, 그 짝이 어긋나면 400이 난다. 여기 모아 두면 한눈에 대조할 수 있고
 * JSX를 거치지 않고 그대로 테스트할 수 있다.
 */

import { draftsToSegments, type SegmentDraft } from "@leave/shared";

export type FormMode = "create" | "edit";

/** 서버에 보낼 JSON 본문. 리소스마다 키가 달라 여기서만 좁힌다. */
export type RecordPayload = Record<string, unknown>;

/** 이 폼에는 파일 입력이 없다. 문자열 항목만 값으로 인정한다. */
export function fieldValue(form: FormData, key: string): string {
  const entry = form.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

/** 빈 문자열은 "지움"(null)으로 보낸다 — 서버가 undefined와 구분한다. */
export function nullableFieldValue(form: FormData, key: string): string | null {
  return fieldValue(form, key) || null;
}

function isChecked(form: FormData, key: string): boolean {
  return form.get(key) === "on";
}

export function userPayload(form: FormData, mode: FormMode): RecordPayload {
  return {
    email: fieldValue(form, "email"),
    // 수정에서 비밀번호를 비워 두면 "안 바꿈"이다. 빈 문자열을 보내면 초기화가 된다.
    ...(fieldValue(form, "password")
      ? { password: fieldValue(form, "password") }
      : {}),
    name: fieldValue(form, "name"),
    branch: fieldValue(form, "branch"),
    enlistedAt: fieldValue(form, "enlistedAt"),
    dischargeAt: fieldValue(form, "dischargeAt"),
    signupRank: fieldValue(form, "signupRank"),
    unitId: nullableFieldValue(form, "unitId"),
    // 생성은 "동의를 확인했다"(dataConsent), 수정은 "동의 상태"(consented)다.
    ...(mode === "create"
      ? { dataConsent: isChecked(form, "dataConsent") }
      : { consented: isChecked(form, "consented") }),
  };
}

export function unitPayload(form: FormData, mode: FormMode): RecordPayload {
  return {
    name: fieldValue(form, "name"),
    description: nullableFieldValue(form, "description"),
    maxLeaveCount: Number(fieldValue(form, "maxLeaveCount")),
    // 생성자는 만든 뒤 바뀌지 않는다.
    ...(mode === "create" ? { creatorId: fieldValue(form, "creatorId") } : {}),
    adminId: fieldValue(form, "adminId"),
  };
}

export function leavePayload(
  form: FormData,
  leaveStart: string,
  drafts: SegmentDraft[],
  sendNotifications: boolean,
): RecordPayload {
  return {
    userId: fieldValue(form, "userId"),
    title: fieldValue(form, "title"),
    reason: nullableFieldValue(form, "reason"),
    segments: draftsToSegments(leaveStart, drafts),
    sendNotifications,
  };
}

export function notificationPayload(
  form: FormData,
  mode: FormMode,
  sendPush: boolean,
): RecordPayload {
  return {
    ...(mode === "create" ? { userId: fieldValue(form, "userId") } : {}),
    title: fieldValue(form, "title"),
    body: fieldValue(form, "body"),
    leaveId: nullableFieldValue(form, "leaveId"),
    dates: fieldValue(form, "dates")
      .split(",")
      .map((date) => date.trim())
      .filter(Boolean),
    ...(mode === "create" ? { sendPush } : { read: isChecked(form, "read") }),
  };
}

export function adminPayload(form: FormData, mode: FormMode): RecordPayload {
  return {
    email: fieldValue(form, "email"),
    name: fieldValue(form, "name"),
    role: fieldValue(form, "role"),
    // 이메일은 생성 시에만 정한다. 활성 여부는 수정에서만 다룬다.
    ...(mode === "edit" ? { active: isChecked(form, "active") } : {}),
  };
}
