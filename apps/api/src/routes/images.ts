import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { users } from "../db/schema";
import type { AppEnv } from "../lib/app";
import { authMiddleware } from "../middleware/auth";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 프로필 이미지 업로드/서빙. 바이너리 본문을 다루므로 OpenAPI 등록 없이 순수 Hono 라우트로 유지.
 * GET은 <img src>에서 쓸 수 있게 인증 없이 서빙 (키에 UUID가 포함되어 추측 불가).
 */
export const imageRoutes = new Hono<AppEnv>()
  .put("/profile", authMiddleware, async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    const ext = EXT_BY_TYPE[contentType.split(";")[0]?.trim() ?? ""];
    if (!ext) {
      return c.json(
        { error: "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다" },
        415,
      );
    }

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) {
      return c.json({ error: "빈 파일입니다" }, 400);
    }
    if (body.byteLength > MAX_BYTES) {
      return c.json({ error: "이미지는 5MB 이하여야 합니다" }, 413);
    }

    const user = c.get("user");
    const key = `profiles/${user.id}/${crypto.randomUUID()}.${ext}`;
    await c.env.BUCKET.put(key, body, {
      httpMetadata: { contentType },
    });

    const db = drizzle(c.env.DB);
    await db
      .update(users)
      .set({ profileImageKey: key })
      .where(eq(users.id, user.id));
    if (user.profileImageKey) {
      c.executionCtx.waitUntil(c.env.BUCKET.delete(user.profileImageKey));
    }
    return c.json({ key }, 201);
  })
  .get("/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const object = await c.env.BUCKET.get(key);
    if (!object) {
      return c.json({ error: "이미지를 찾을 수 없습니다" }, 404);
    }
    c.header(
      "content-type",
      object.httpMetadata?.contentType ?? "application/octet-stream",
    );
    c.header("cache-control", "public, max-age=31536000, immutable");
    return c.body(object.body);
  });
