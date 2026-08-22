import { monthBounds, personalEventCreateSchema } from "@leave/shared";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { personalEvents } from "../db/schema";
import { createApp } from "../lib/app";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";
import {
  createPersonalEventRoute,
  deletePersonalEventRoute,
  getPersonalEventRoute,
  listPersonalEventCalendarsRoute,
  listPersonalEventsRoute,
  updatePersonalEventRoute,
} from "./personal-events.contract";

const publicColumns = {
  id: personalEvents.id,
  title: personalEvents.title,
  startDate: personalEvents.startDate,
  endDate: personalEvents.endDate,
  startTime: personalEvents.startTime,
  endTime: personalEvents.endTime,
  note: personalEvents.note,
  createdAt: personalEvents.createdAt,
  updatedAt: personalEvents.updatedAt,
} as const;

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);

export const personalEventRoutes = app
  .openapi(listPersonalEventsRoute, async (c) => {
    const { start, end } = monthBounds(c.req.valid("query").month);
    const events = await drizzle(c.env.DB)
      .select(publicColumns)
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.ownerUserId, c.get("user").id),
          lte(personalEvents.startDate, end),
          gte(personalEvents.endDate, start),
        ),
      )
      .orderBy(asc(personalEvents.startDate))
      .all();
    return c.json({ events }, 200);
  })
  .openapi(listPersonalEventCalendarsRoute, async (c) => {
    const months = c.req.valid("query").months.split(",");
    const bounds = months.map(monthBounds);
    const start = bounds.reduce(
      (value, range) => (range.start < value ? range.start : value),
      bounds[0]!.start,
    );
    const end = bounds.reduce(
      (value, range) => (range.end > value ? range.end : value),
      bounds[0]!.end,
    );
    const events = await drizzle(c.env.DB)
      .select(publicColumns)
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.ownerUserId, c.get("user").id),
          lte(personalEvents.startDate, end),
          gte(personalEvents.endDate, start),
        ),
      )
      .orderBy(asc(personalEvents.startDate))
      .all();
    return c.json({ events }, 200);
  })
  .openapi(getPersonalEventRoute, async (c) => {
    const event = await drizzle(c.env.DB)
      .select(publicColumns)
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.id, c.req.valid("param").id),
          eq(personalEvents.ownerUserId, c.get("user").id),
        ),
      )
      .get();
    if (!event) return c.json({ error: "일정을 찾을 수 없습니다" }, 404);
    return c.json({ event }, 200);
  })
  .openapi(createPersonalEventRoute, async (c) => {
    const input = c.req.valid("json");
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      ownerUserId: c.get("user").id,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await drizzle(c.env.DB).insert(personalEvents).values(row);
    const { ownerUserId: _ownerUserId, ...event } = row;
    return c.json({ event }, 201);
  })
  .openapi(updatePersonalEventRoute, async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.valid("param").id;
    const existing = await db
      .select()
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.id, id),
          eq(personalEvents.ownerUserId, c.get("user").id),
        ),
      )
      .get();
    if (!existing) return c.json({ error: "일정을 찾을 수 없습니다" }, 404);
    const input = c.req.valid("json");
    const merged = personalEventCreateSchema.safeParse({
      title: input.title ?? existing.title,
      startDate: input.startDate ?? existing.startDate,
      endDate: input.endDate ?? existing.endDate,
      startTime:
        input.startTime === undefined ? existing.startTime : input.startTime,
      endTime: input.endTime === undefined ? existing.endTime : input.endTime,
      note: input.note === undefined ? existing.note : input.note,
    });
    if (!merged.success)
      return c.json(
        {
          error:
            merged.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
        },
        400,
      );
    const updatedAt = new Date().toISOString();
    await db
      .update(personalEvents)
      .set({
        ...merged.data,
        startTime: merged.data.startTime ?? null,
        endTime: merged.data.endTime ?? null,
        note: merged.data.note ?? null,
        updatedAt,
      })
      .where(
        and(
          eq(personalEvents.id, id),
          eq(personalEvents.ownerUserId, c.get("user").id),
        ),
      );
    return c.json(
      {
        event: {
          id,
          ...merged.data,
          startTime: merged.data.startTime ?? null,
          endTime: merged.data.endTime ?? null,
          note: merged.data.note ?? null,
          createdAt: existing.createdAt,
          updatedAt,
        },
      },
      200,
    );
  })
  .openapi(deletePersonalEventRoute, async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.valid("param").id;
    const existing = await db
      .select({ id: personalEvents.id })
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.id, id),
          eq(personalEvents.ownerUserId, c.get("user").id),
        ),
      )
      .get();
    if (!existing) return c.json({ error: "일정을 찾을 수 없습니다" }, 404);
    await db
      .delete(personalEvents)
      .where(
        and(
          eq(personalEvents.id, id),
          eq(personalEvents.ownerUserId, c.get("user").id),
        ),
      );
    return c.json({ ok: true as const }, 200);
  });
