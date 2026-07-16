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

export type UserRow = typeof users.$inferSelect;
export type UnitRow = typeof units.$inferSelect;
export type LeaveRow = typeof leaves.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
