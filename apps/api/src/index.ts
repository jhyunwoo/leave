import { Scalar } from "@scalar/hono-api-reference";
import { drizzle } from "drizzle-orm/d1";
import { cors } from "hono/cors";
import { createApp } from "./lib/app";
import { accrueAllRegularOvernights } from "./lib/leave-balances";
import { accessLogMiddleware } from "./middleware/access-log";
import { authRoutes } from "./routes/auth";
import { imageRoutes } from "./routes/images";
import { leaveRoutes } from "./routes/leaves";
import { notificationRoutes } from "./routes/notifications";
import { pushRoutes } from "./routes/push";
import { unitRoutes } from "./routes/units";

const app = createApp();

// 가장 바깥에서 모든 요청을 접속 기록에 남긴다 (동의 기반, next() 이후 사용자 식별 포함).
app.use("*", accessLogMiddleware);

app.use("*", async (c, next) => {
  const origin = c.env.CORS_ORIGIN ?? "*";
  return cors({
    origin,
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Client-Platform",
      "X-Client-Version",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })(c, next);
});

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ error: "서버 오류가 발생했습니다" }, 500);
});

app.notFound((c) => c.json({ error: "요청한 리소스를 찾을 수 없습니다" }, 404));

app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
  description: "로그인/회원가입 응답의 token 값",
});

const routes = app
  .get("/", (c) => c.json({ name: "Leave API", status: "ok" }))
  .route("/auth", authRoutes)
  .route("/units", unitRoutes)
  .route("/leaves", leaveRoutes)
  .route("/notifications", notificationRoutes)
  .route("/push", pushRoutes)
  .route("/images", imageRoutes);

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Leave API",
    version: "1.0.0",
    description:
      "군 휴가 계획/공유 서비스 API. 부대별 휴가 등록과 일별 최대 출타 인원 초과 확인을 제공합니다.",
  },
});

app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "Leave API 문서" }));

/** Hono Stack RPC용 앱 타입 — 웹/앱에서 hc<AppType>()으로 사용. */
export type AppType = typeof routes;

export default {
  fetch: app.fetch,
  scheduled: async (
    _controller: ScheduledController,
    env: import("./lib/app").AppBindings,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(accrueAllRegularOvernights(drizzle(env.DB)));
  },
};
