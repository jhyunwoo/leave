import { createRoute } from "@hono/zod-openapi";
import { pushTokenSchema } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../db/schema";
import { createApp } from "../lib/app";
import { errorResponse, jsonContent, okSchema } from "../lib/responses";
import { authMiddleware } from "../middleware/auth";

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

const app = createApp();
app.use("*", authMiddleware);

export const pushRoutes = app.openapi(registerTokenRoute, async (c) => {
  const { token } = c.req.valid("json");
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  await db
    .update(users)
    .set({ expoPushToken: token })
    .where(eq(users.id, user.id));
  return c.json({ ok: true as const }, 200);
});
