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
import { adminImageRoutes } from "./routes/admins-images";
import { leaveContentRoutes } from "./routes/leaves-content";
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
operations.route("/", leaveContentRoutes);
operations.route("/", adminImageRoutes);
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
