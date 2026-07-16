import { z } from "@hono/zod-openapi";
import { BRANCHES, RANKS } from "@leave/shared";

export const errorSchema = z
  .object({ error: z.string() })
  .openapi("ErrorResponse");

export const okSchema = z.object({ ok: z.literal(true) }).openapi("Ok");

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    branch: z.enum(BRANCHES),
    branchLabel: z.string(),
    enlistedAt: z.string(),
    dischargeAt: z.string(),
    unitId: z.string().nullable(),
    profileImageKey: z.string().nullable(),
    rank: z.enum(RANKS),
    rankLabel: z.string(),
    nextPromotionDate: z.string().nullable(),
    serviceProgress: z.number(),
    daysUntilDischarge: z.number(),
  })
  .openapi("User");

export const memberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    branch: z.enum(BRANCHES),
    branchLabel: z.string(),
    rank: z.enum(RANKS),
    rankLabel: z.string(),
    profileImageKey: z.string().nullable(),
    enlistedAt: z.string(),
    dischargeAt: z.string(),
  })
  .openapi("Member");

export const unitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    maxLeaveNumerator: z.number(),
    maxLeaveDenominator: z.number(),
    memberCount: z.number(),
    createdAt: z.string(),
  })
  .openapi("Unit");

export const leaveSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Leave");

export const calendarLeaveSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    userName: z.string(),
    userRankLabel: z.string(),
    userProfileImageKey: z.string().nullable(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
  })
  .openapi("CalendarLeave");

export const dayStatSchema = z
  .object({
    date: z.string(),
    userIds: z.array(z.string()),
    count: z.number(),
    allowed: z.number(),
    exceeded: z.boolean(),
  })
  .openapi("DayStat");

export const calendarSchema = z
  .object({
    month: z.string(),
    unit: unitSchema,
    days: z.array(dayStatSchema),
    leaves: z.array(calendarLeaveSchema),
  })
  .openapi("UnitCalendar");

export const notificationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    leaveId: z.string().nullable(),
    dates: z.array(z.string()),
    read: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("Notification");

export const authResponseSchema = z
  .object({
    token: z.string(),
    user: userSchema,
  })
  .openapi("AuthResponse");

export const jsonContent = <T extends z.ZodType>(
  schema: T,
  description: string,
) => ({
  content: { "application/json": { schema } },
  description,
});

export const errorResponse = (description: string) =>
  jsonContent(errorSchema, description);
