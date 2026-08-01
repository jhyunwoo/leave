import {
  BALANCE_KEYS,
  BRANCHES,
  LEAVE_CATEGORIES,
  OVERNIGHT_KINDS,
  RANKS,
} from "@leave/shared";
import {
  index,
  integer,
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
    profileImageKey: text("profile_image_key"),
    unitId: text("unit_id"),
    expoPushToken: text("expo_push_token"),
    // 개인정보(접속 기록·푸시 로그) 수집에 동의한 시각. 미동의(구 사용자)면 null.
    consentedAt: text("consented_at"),
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
  maxLeaveNumerator: integer("max_leave_numerator").notNull(),
  maxLeaveDenominator: integer("max_leave_denominator").notNull(),
  // 직접 지정한 하루 최대 출타 인원. null이면 기존 비율을 사용한다.
  maxLeaveCount: integer("max_leave_count"),
  creatorId: text("creator_id").notNull(),
  // 부대 관리자. 생성 시 생성자로 초기화되며 이관으로 바뀔 수 있다.
  adminId: text("admin_id").notNull(),
  // 관리자가 설정한 부대 인원(출타율 계산 기준). null이면 앱 가입자 수로 대체.
  headcount: integer("headcount"),
  // 부대 대표 이미지 R2 키.
  imageKey: text("image_key"),
  createdAt: text("created_at").notNull(),
});

/**
 * 부대 가입 신청 — 관리자 승인 전까지 대기 상태로 존재한다.
 * 승인되면 users.unitId가 설정되고 이 행은 삭제된다. 거절 시에도 삭제된다.
 */
export const unitJoinRequests = sqliteTable(
  "unit_join_requests",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id").notNull(),
    // 사용자당 동시에 하나의 대기 신청만 허용한다.
    userId: text("user_id").notNull().unique(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("unit_join_requests_unit_idx").on(t.unitId)],
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
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("leaves_user_idx").on(t.userId),
    index("leaves_dates_idx").on(t.startDate, t.endDate),
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

/** 정기외박 주기 도래로 자동 생성된 적립 원장. */
export const leaveBalanceGrants = sqliteTable(
  "leave_balance_grants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    balanceKey: text("balance_key", { enum: BALANCE_KEYS }).notNull(),
    days: integer("days").notNull(),
    effectiveDate: text("effective_date").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("leave_balance_grants_due_unique").on(
      t.userId,
      t.balanceKey,
      t.effectiveDate,
    ),
    index("leave_balance_grants_user_idx").on(t.userId),
  ],
);

export const regularOvernightConfigs = sqliteTable(
  "regular_overnight_configs",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    nextGrantDate: text("next_grant_date"),
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
    userAgent: text("user_agent"),
    // Cloudflare가 부여하는 접속 IP(CF-Connecting-IP)와 국가 코드(CF-IPCountry)
    ip: text("ip"),
    country: text("country"),
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
    title: text("title"),
    body: text("body"),
    dataJson: text("data_json"),
    // ok | error | skipped
    status: text("status"),
    detail: text("detail"),
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

export type UserRow = typeof users.$inferSelect;
export type UnitRow = typeof units.$inferSelect;
export type UnitJoinRequestRow = typeof unitJoinRequests.$inferSelect;
export type LeaveRow = typeof leaves.$inferSelect;
export type LeaveSegmentRow = typeof leaveSegments.$inferSelect;
export type UserLeaveBalanceRow = typeof userLeaveBalances.$inferSelect;
export type LeaveBalanceGrantRow = typeof leaveBalanceGrants.$inferSelect;
export type RegularOvernightConfigRow =
  typeof regularOvernightConfigs.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AccessLogRow = typeof accessLogs.$inferSelect;
export type PushLogRow = typeof pushLogs.$inferSelect;
export type AdminAccountRow = typeof adminAccounts.$inferSelect;
export type AdminSessionRow = typeof adminSessions.$inferSelect;
export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
