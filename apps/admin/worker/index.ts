/**
 * 관리자 워커의 진입점 — 보안 헤더, 인증 단계, 라우트 마운트.
 *
 * 배포: Cloudflare Workers. 정적 자산(관리자 SPA)은 ASSETS 바인딩이 낸다.
 *
 * 접근 단계가 세 겹이다.
 *  1) csrfMiddleware        — 쿠키 세션을 쓰므로 교차 출처 변경 요청을 막는다.
 *  2) adminAuthMiddleware   — 로그인한 관리자만 통과.
 *  3) passwordChangedMiddleware — 임시 비밀번호를 아직 안 바꾼 계정은
 *                                 실제 운영 API에 닿지 못하게 막는다.
 * /api로 시작하지 않는 요청은 SPA 자산으로 넘겨 클라이언트 라우팅이 이어지게 한다.
 */

import { Hono } from "hono";
import {
  adminAuthMiddleware,
  adminDto,
  changeAdminPassword,
  csrfMiddleware,
  loginAdmin,
  logoutAdmin,
  passwordChangedMiddleware,
} from "./auth";
import { adminAccountRoutes } from "./routes/admins";
import { contentReportRoutes } from "./routes/content-reports";
import { adminLeaveRoutes } from "./routes/leaves";
import { adminNotificationRoutes } from "./routes/notifications";
import { unitInviteRoutes } from "./routes/unit-invites";
import { overviewLogRoutes } from "./routes/overview-logs";
import { userUnitRoutes } from "./routes/users-units";
import type { AdminAppEnv } from "./types";

const app = new Hono<AdminAppEnv>();

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
app.use("/api/*", csrfMiddleware);

app.get("/api/health", (c) =>
  c.json({ name: "Leave Admin", status: "ok" as const }),
);
app.post("/api/auth/login", loginAdmin);

const protectedApi = new Hono<AdminAppEnv>();
protectedApi.use("*", adminAuthMiddleware);
protectedApi.get("/auth/me", (c) =>
  c.json({ admin: adminDto(c.get("admin")) }),
);
protectedApi.post("/auth/logout", logoutAdmin);
protectedApi.post("/auth/change-password", changeAdminPassword);

const operations = new Hono<AdminAppEnv>();
operations.use("*", passwordChangedMiddleware);
operations.route("/", overviewLogRoutes);
operations.route("/", userUnitRoutes);
operations.route("/", adminLeaveRoutes);
operations.route("/", unitInviteRoutes);
operations.route("/", contentReportRoutes);
operations.route("/", adminNotificationRoutes);
operations.route("/", adminAccountRoutes);
protectedApi.route("/", operations);

app.route("/api", protectedApi);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: "요청한 관리자 API를 찾을 수 없습니다" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "admin_unhandled_error",
      path: c.req.path,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return c.json({ error: "관리자 서버 오류가 발생했습니다" }, 500);
});

export default app;
