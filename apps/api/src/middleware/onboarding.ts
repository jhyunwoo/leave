import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/app";

/** 계정만 만든 사용자가 달력·휴가 API를 먼저 호출하지 못하게 하는 서버 관문. */
export const onboardingMiddleware = createMiddleware<AppEnv>(
  async (c, next) => {
    if (!c.get("user").onboardingCompletedAt) {
      return c.json({ error: "온보딩을 먼저 완료해주세요" }, 428);
    }
    await next();
  },
);
