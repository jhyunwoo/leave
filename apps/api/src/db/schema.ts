import { BRANCHES, RANKS } from "@leave/shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  creatorId: text("creator_id").notNull(),
  createdAt: text("created_at").notNull(),
});

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

export type UserRow = typeof users.$inferSelect;
export type UnitRow = typeof units.$inferSelect;
export type LeaveRow = typeof leaves.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AccessLogRow = typeof accessLogs.$inferSelect;
export type PushLogRow = typeof pushLogs.$inferSelect;
