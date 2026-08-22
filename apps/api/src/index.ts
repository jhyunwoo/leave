/**
 * API 워커의 진입점 — 미들웨어 순서와 라우트 마운트를 정한다.
 *
 * 배포: Cloudflare Workers (wrangler.jsonc). 로컬은 `pnpm dev:web`이 8787로 띄운다.
 *
 * 미들웨어는 바깥에서 안쪽 순서로 쌓인다.
 *  1) 접속 기록  — 동의한 사용자의 요청을 남긴다. next() 뒤에 실행돼 인증된 사용자까지 안다.
 *  2) CORS       — 허용 오리진은 환경변수로 받는다.
 *  3) 최소 버전  — 출타 계산 규칙이 바뀐 뒤의 구버전 앱을 끊는다.
 *
 * fetch 말고 `scheduled`도 내보낸다 — 보관 기간이 지난 로그와 만료 세션을 지우는
 * 정리 작업이다(wrangler.jsonc의 cron 트리거).
 *
 * 마지막에 체이닝된 `routes`의 타입이 그대로 `AppType`이 되고, 웹/앱이
 * `hc<AppType>()`으로 가져가 컴파일 타임에 경로·입력·응답을 맞춘다.
 * 즉 라우트를 고치면 클라이언트에서 타입 오류로 즉시 드러난다.
 */

import { Scalar } from "@scalar/hono-api-reference";
import { drizzle } from "drizzle-orm/d1";
import { cors } from "hono/cors";
import { createApp, type AppBindings } from "./lib/app";
import { pruneExpiredData, resolveRetentionDays } from "./lib/retention";
import { accessLogMiddleware } from "./middleware/access-log";
import { minVersionMiddleware } from "./middleware/min-version";
import { authRoutes } from "./routes/auth";
import { leaveRoutes } from "./routes/leaves";
import { friendRoutes } from "./routes/friends";
import { personalEventRoutes } from "./routes/personal-events";
import { moderationRoutes } from "./routes/moderation";
import { notificationRoutes } from "./routes/notifications";
import { pushRoutes } from "./routes/push";
import { unitRoutes } from "./routes/units";

/**
 * Hono의 `app.use("*", ...)` 콜백이 받는 Context는 경로 제네릭이 `"*"`로 굳어
 * 있어, `createMiddleware<AppEnv>()`가 기대하는 `Context<AppEnv, string, {}>`와
 * 서로 대입되지 않는다(입력 제네릭이 any로 남는다). 감싸는 미들웨어 안에서
 * 다른 미들웨어를 직접 부를 때마다 나오는 프레임워크 타이핑 한계이며,
 * 런타임 계약은 동일하다 — 아래 세 곳에서만 규칙을 끈다.
 */
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Hono 미들웨어 합성 타이핑 한계 (위 주석)
  })(c, next);
});

// 지원하지 않는 구버전 앱은 어떤 데이터도 받아가지 못하게 여기서 끊는다.
// /meta와 문서는 업데이트 안내를 받아야 하므로 예외로 둔다.
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    path === "/" ||
    path === "/meta" ||
    path.startsWith("/docs") ||
    path === "/openapi.json"
  ) {
    return next();
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Hono 미들웨어 합성 타이핑 한계 (위 주석)
  return minVersionMiddleware(c, next);
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

// 체인의 반환값은 런타임에서 쓰이지 않는다. 존재 이유는 타입 하나 — 이 타입이
// 그대로 AppType이 되어 웹/앱의 hc<AppType>()에 들어간다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
  .get("/", (c) => c.json({ name: "Leave API", status: "ok" }))
  // 앱이 차단당했을 때 무엇을 해야 하는지 알려면 인증 없이 읽을 수 있어야 한다.
  .get("/meta", (c) =>
    c.json({
      minSupportedVersion: c.env.MIN_APP_VERSION ?? null,
      latestVersion: c.env.LATEST_APP_VERSION ?? null,
    }),
  )
  .route("/auth", authRoutes)
  .route("/units", unitRoutes)
  .route("/leaves", leaveRoutes)
  .route("/friends", friendRoutes)
  .route("/personal-events", personalEventRoutes)
  .route("/notifications", notificationRoutes)
  .route("/push", pushRoutes)
  .route("/moderation", moderationRoutes);

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Leave API",
    version: "1.0.0",
    description:
      "비식별 공유 그룹의 휴가 계획을 바탕으로 출타율 추정 신호를 제공하는 비공식 참고용 API입니다.",
  },
});

app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "Leave API 문서" }));

/** Hono Stack RPC용 앱 타입 — 웹/앱에서 hc<AppType>()으로 사용. */
export type AppType = typeof routes;

export default {
  fetch: app.fetch,

  /**
   * 정기 정리 — 보관 기간이 지난 접속 기록·푸시 로그와 만료된 세션을 지운다.
   *
   * 실패해도 다음 실행이 이어서 하면 되므로 던지지 않고 기록만 남긴다.
   * 던지면 Cloudflare가 실패로 재시도하는데, 여기서 재시도가 도움이 되는 상황이 없다.
   */
  async scheduled(
    _event: ScheduledController,
    env: AppBindings,
  ): Promise<void> {
    try {
      const summary = await pruneExpiredData(drizzle(env.DB), {
        retentionDays: resolveRetentionDays(env.LOG_RETENTION_DAYS),
      });
      console.log("retention", JSON.stringify(summary));
    } catch (err) {
      console.error("보관 기간 정리 실패", err);
    }
  },
};
