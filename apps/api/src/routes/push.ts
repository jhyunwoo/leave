/**
 * 푸시 토큰 등록과 수신·열람 이벤트 보고 라우트.
 *
 * 마운트 위치: `/push` (apps/api/src/index.ts).
 * 앱이 발급받은 Expo 토큰을 사용자에 묶고, 실제 도달 여부를 로그로 남긴다.
 * 메시지 원문은 저장하지 않는다(알림 id만 남긴다).
 */

import { createRoute } from "@hono/zod-openapi";
import { pushEventSchema, pushTokenSchema } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { pushLogs, users } from "../db/schema";
import { createApp } from "../lib/app";
import { errorResponse, jsonContent, okSchema } from "../lib/responses";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";

const registerTokenRoute = createRoute({
  method: "put",
  path: "/token",
  tags: ["푸시"],
  summary: "Expo 푸시 토큰 등록",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: pushTokenSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "등록 완료"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

const pushEventRoute = createRoute({
  method: "post",
  path: "/events",
  tags: ["푸시"],
  summary: "푸시 수신/열람 이벤트 보고 (앱이 받은 이 앱의 알림에 한함)",
  description:
    "이 앱이 보낸 알림을 기기에서 수신(receipt)하거나 사용자가 열람(open)했을 때 앱이 직접 보고합니다. 기기의 다른 앱 알림은 대상이 아닙니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: pushEventSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "기록 완료"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);

export const pushRoutes = app
  .openapi(registerTokenRoute, async (c) => {
    const { token } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db
      .update(users)
      .set({ expoPushToken: token })
      .where(eq(users.id, user.id));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(pushEventRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db.insert(pushLogs).values({
      id: crypto.randomUUID(),
      userId: user.id,
      notificationId: input.notificationId ?? null,
      direction: input.direction,
      status: "ok",
      createdAt: new Date().toISOString(),
    });
    return c.json({ ok: true as const }, 200);
  });
