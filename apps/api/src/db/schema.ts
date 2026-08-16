/**
 * D1(SQLite) 테이블 정의 — 이 서비스의 데이터 모양 전부.
 *
 * 사용처: API 라우트와 관리자 워커(`@leave/api/db`로 가져간다).
 * 마이그레이션: 이 파일을 고친 뒤 `pnpm --filter @leave/api db:generate`.
 *
 * 열거형(군 종류·계급·휴가 종류·상태)은 @leave/shared의 상수를 그대로 쓴다.
 * DB와 앱이 다른 목록을 들고 있으면 저장은 되는데 화면에서 라벨이 비는 사고가 난다.
 *
 * 개인정보 최소 수집 원칙: 접속 로그에 IP·국가·User-Agent를 두지 않고,
 * 푸시 로그에 메시지 원문을 두지 않는다. 초대코드는 해시만 저장한다.
 * 사용자·부대 이미지는 아예 다루지 않는다 — 군사시설 촬영 위험과 사진 권한
 * 요구를 없애려고 업로드 경로와 R2 저장소를 통째로 걷어냈다(0018).
 */

import {
  BALANCE_KEYS,
  BRANCHES,
  LEAVE_CATEGORIES,
  LEAVE_STATUSES,
  OVERNIGHT_KINDS,
  RANKS,
} from "@leave/shared";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    name: text("name").notNull(),
    branch: text("branch", { enum: BRANCHES }).notNull(),
    enlistedAt: text("enlisted_at").notNull(),
    dischargeAt: text("discharge_at").notNull(),
    signupRank: text("signup_rank", { enum: RANKS }).notNull(),
    unitId: text("unit_id"),
    expoPushToken: text("expo_push_token"),
    // 개인정보(접속 기록·푸시 로그) 수집에 동의한 시각. 미동의(구 사용자)면 null.
    consentedAt: text("consented_at"),
    /** null이면 계정은 있으나 필수 온보딩을 마치지 않은 상태다. */
    onboardingCompletedAt: text("onboarding_completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("users_unit_idx").on(t.unitId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const units = sqliteTable("units", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // 실제 부대 정원이 아닌, 관리자가 계산 기준으로 지정한 임의의 값.
  referenceMemberTotal: integer("reference_member_total"),
  // 부대 관리자가 지정한 하루 최대 출타 인원.
  maxLeaveCount: integer("max_leave_count").notNull(),
  /**
   * 복귀일을 출타 인원으로 셀지. 부대마다 "복귀일 오전 복귀 = 그날은 출타 아님"인
   * 곳과 아닌 곳이 갈려 하드코딩할 수 없다. 당일 외출(시작=종료)은 이 값과
   * 무관하게 항상 하루로 센다.
   */
  returnDayCounts: integer("return_day_counts", { mode: "boolean" })
    .notNull()
    .default(true),
  lastTotalUpdatedAt: text("last_total_updated_at"),
  creatorId: text("creator_id").notNull(),
  // 부대 관리자. 생성 시 생성자로 초기화되며 이관으로 바뀔 수 있다.
  adminId: text("admin_id").notNull(),
  createdAt: text("created_at").notNull(),
});

/**
 * 그룹 초대코드. 원문은 발급 응답에서 한 번만 보여주며 DB에는 SHA-256 해시만 저장한다.
 */
export const unitInvites = sqliteTable(
  "unit_invites",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    maxUses: integer("max_uses").notNull(),
    usedCount: integer("used_count").notNull().default(0),
    revokedAt: text("revoked_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("unit_invites_unit_idx").on(t.unitId),
    index("unit_invites_expires_idx").on(t.expiresAt),
  ],
);

export const leaves = sqliteTable(
  "leaves",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    reason: text("reason"),
    // draft는 나만 보이고 집계에서 빠진다. 자세한 규칙은 shared의 LEAVE_STATUSES 참고.
    status: text("status", { enum: LEAVE_STATUSES })
      .notNull()
      .default("shared"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("leaves_user_idx").on(t.userId),
    index("leaves_dates_idx").on(t.startDate, t.endDate),
    index("leaves_status_idx").on(t.status),
  ],
);

/**
 * 검열·훈련처럼 출타율과 무관하게 지휘관이 휴가를 제한할 수 있는 기간.
 * 이게 없으면 앱은 "가능"이라 했는데 현실은 불가인 상황이 반복된다.
 */
export const unitBlackouts = sqliteTable(
  "unit_blackouts",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    reason: text("reason"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("unit_blackouts_unit_idx").on(t.unitId),
    index("unit_blackouts_dates_idx").on(t.startDate, t.endDate),
  ],
);

/**
 * 휴가를 이루는 구간. "8/2~8/5는 연가, 8/6~8/9는 정기외박"처럼 날짜별 재원을 담는다.
 * 한 휴가 안에서 같은 재원이 여러 번 나올 수 있어 유일 제약을 두지 않는다.
 * days는 날짜에서 파생되지만 잔여량 집계 쿼리를 단순하게 유지하려고 함께 저장한다.
 */
export const leaveSegments = sqliteTable(
  "leave_segments",
  {
    id: text("id").primaryKey(),
    leaveId: text("leave_id")
      .notNull()
      .references(() => leaves.id, { onDelete: "cascade" }),
    category: text("category", { enum: LEAVE_CATEGORIES }).notNull(),
    overnightKind: text("overnight_kind", { enum: OVERNIGHT_KINDS }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    days: integer("days").notNull(),
  },
  (t) => [
    index("leave_segments_leave_idx").on(t.leaveId),
    index("leave_segments_dates_idx").on(t.startDate, t.endDate),
  ],
);

/**
 * 사용자가 직접 수정하는 휴가 총량 조정값.
 * 정기외박 자동 적립분과 합산한 값이 화면에 보이는 총 보유일수다.
 */
export const userLeaveBalances = sqliteTable(
  "user_leave_balances",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    balanceKey: text("balance_key", { enum: BALANCE_KEYS }).notNull(),
    adjustmentDays: integer("adjustment_days").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("user_leave_balances_user_key_unique").on(
      t.userId,
      t.balanceKey,
    ),
    index("user_leave_balances_user_idx").on(t.userId),
  ],
);

/**
 * 사용자가 실제로 "받은" 휴가 한 건. 같은 재원을 만기가 다른 여러 건으로 나눠 가질 수 있다
 * (포상휴가 3일 ~8/31 + 포상휴가 2일 만기 없음). 재원 총량은 이 행들의 합이다.
 *
 * 정기외박 자동 적립분은 여기 담지 않는다 — 주기 설정에서 파생하며, 원장으로 담았다가
 * 0009에서 되돌린 전례가 있다.
 *
 * 같은 날 받은 만기가 다른 두 건이 있을 수 있으므로 유니크 인덱스를 두지 않는다.
 */
export const leaveGrants = sqliteTable(
  "leave_grants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    balanceKey: text("balance_key", { enum: BALANCE_KEYS }).notNull(),
    days: integer("days").notNull(),
    /** 부여일 — 이 날부터 쓸 수 있다. null이면 시작 제한 없음. */
    grantedOn: text("granted_on"),
    /** 사용 만기 기한(이 날까지 포함). null이면 만료되지 않는다. */
    expiresOn: text("expires_on"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("leave_grants_user_idx").on(t.userId),
    index("leave_grants_user_key_idx").on(t.userId, t.balanceKey),
  ],
);

export const regularOvernightConfigs = sqliteTable(
  "regular_overnight_configs",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    // 주기 시작일. 1주기가 시작하는 날이며, 첫 적립은 한 주기 뒤에 이뤄진다.
    startDate: text("start_date"),
    intervalDays: integer("interval_days"),
    daysPerGrant: integer("days_per_grant"),
    updatedAt: text("updated_at").notNull(),
  },
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    leaveId: text("leave_id"),
    datesJson: text("dates_json"),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    // 사용자가 알림함에서 지운 시각. 값이 있으면 사용자 API에서 보이지 않는다.
    // 행은 남겨 둔다 — 관리자 화면의 발송 이력이 사용자 조작으로 사라지면 안 된다.
    deletedAt: text("deleted_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

/**
 * 접속 기록 — 사용자 동의(가입 시 고지) 하에 각 요청의 메타데이터를 저장한다.
 * 요청 본문·비밀번호 등 민감 정보는 담지 않고, 접속 시각·경로·플랫폼 등만 기록한다.
 */
export const accessLogs = sqliteTable(
  "access_logs",
  {
    id: text("id").primaryKey(),
    // 로그인 사용자면 해당 id, 비로그인 요청은 null
    userId: text("user_id"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    // 클라이언트가 보낸 X-Client-Platform 헤더(ios/android/web) 또는 UA 추정값
    platform: text("platform"),
    // 클라이언트가 보낸 X-Client-Version 헤더
    appVersion: text("app_version"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("access_logs_user_idx").on(t.userId),
    index("access_logs_created_idx").on(t.createdAt),
  ],
);

/**
 * 푸시 알림 로그 — 서버가 보낸 발송(send)과, 앱이 스스로 보고한 수신(receipt)·열람(open) 이벤트.
 * 수신/열람은 이 앱이 보낸 알림에 한해 앱이 직접 보고하며, 기기의 다른 알림은 수집하지 않는다.
 */
export const pushLogs = sqliteTable(
  "push_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    // 연관된 인앱 알림(notifications) id — 없을 수 있음
    notificationId: text("notification_id"),
    direction: text("direction", {
      enum: ["send", "receipt", "open"],
    }).notNull(),
    // ok | error | skipped
    status: text("status"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("push_logs_user_idx").on(t.userId),
    index("push_logs_created_idx").on(t.createdAt),
  ],
);

/** 일반 사용자 계정과 분리된 전역 관리자 계정. */
export const adminAccounts = sqliteTable("admin_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "admin"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** 관리자 브라우저 세션. 원문 토큰은 저장하지 않고 SHA-256 해시만 저장한다. */
export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => adminAccounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("admin_sessions_admin_idx").on(t.adminId),
    index("admin_sessions_expires_idx").on(t.expiresAt),
  ],
);

/**
 * 관리자 감사 로그 — 관리자 계정을 비활성화하거나 삭제해도 운영 이력이 남도록
 * 관리자 이메일 스냅샷을 함께 저장하고 레코드 수정/삭제 API는 제공하지 않는다.
 */
export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id"),
    adminEmail: text("admin_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("admin_audit_logs_admin_idx").on(t.adminId),
    index("admin_audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("admin_audit_logs_created_idx").on(t.createdAt),
  ],
);

/** 알림 종류별 수신 설정. 행이 없으면 전부 켜진 것으로 본다. */
export const userNotificationPrefs = sqliteTable("user_notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  overage: integer("overage", { mode: "boolean" }).notNull().default(true),
  blackout: integer("blackout", { mode: "boolean" }).notNull().default(true),
  unitNotice: integer("unit_notice", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: text("updated_at").notNull(),
});

/**
 * 자유 입력(그룹 별칭·설명, 참여자 별칭) 신고. 신고자가 탈퇴해도 접수 건은
 * 남겨야 하므로 reporterId는 nullable이고 외래키를 걸지 않는다.
 */
export const contentReports = sqliteTable(
  "content_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id"),
    targetType: text("target_type", { enum: ["unit", "member"] }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    detail: text("detail"),
    status: text("status", { enum: ["open", "reviewing", "resolved"] })
      .notNull()
      .default("open"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("content_reports_status_idx").on(t.status),
    index("content_reports_target_idx").on(t.targetType, t.targetId),
  ],
);

/** 차단은 목록 표시에만 영향을 준다. 출타 집계에서는 빼지 않는다. */
export const userBlocks = sqliteTable(
  "user_blocks",
  {
    userId: text("user_id").notNull(),
    blockedUserId: text("blocked_user_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.blockedUserId] }),
    index("user_blocks_user_idx").on(t.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type UnitRow = typeof units.$inferSelect;
export type UnitInviteRow = typeof unitInvites.$inferSelect;
export type UnitBlackoutRow = typeof unitBlackouts.$inferSelect;
export type UserNotificationPrefsRow =
  typeof userNotificationPrefs.$inferSelect;
export type ContentReportRow = typeof contentReports.$inferSelect;
export type UserBlockRow = typeof userBlocks.$inferSelect;
export type LeaveRow = typeof leaves.$inferSelect;
export type LeaveSegmentRow = typeof leaveSegments.$inferSelect;
export type UserLeaveBalanceRow = typeof userLeaveBalances.$inferSelect;
export type LeaveGrantRow = typeof leaveGrants.$inferSelect;
export type RegularOvernightConfigRow =
  typeof regularOvernightConfigs.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AccessLogRow = typeof accessLogs.$inferSelect;
export type PushLogRow = typeof pushLogs.$inferSelect;
export type AdminAccountRow = typeof adminAccounts.$inferSelect;
export type AdminSessionRow = typeof adminSessions.$inferSelect;
export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
