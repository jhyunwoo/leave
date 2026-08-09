/**
 * 인증·프로필 라우트.
 *
 * 마운트 위치: `/auth` (apps/api/src/index.ts).
 * 다루는 것: 회원가입, 로그인, 내 정보, 프로필 수정·이미지, 로그아웃, 회원 탈퇴.
 *
 * 회원가입은 계정만 만드는 게 아니라 군 종류별 기본 연가 적립분까지 함께 넣는다.
 * 탈퇴는 관련 데이터를 모두 지우고, 남은 부대원이 있으면 관리자를 이관한다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import {
  DEFAULT_ANNUAL_DAYS,
  loginSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  signupSchema,
} from "@leave/shared";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import {
  accessLogs,
  leaveGrants,
  leaves,
  contentReports,
  notifications,
  pushLogs,
  sessions,
  unitInvites,
  units,
  userBlocks,
  userNotificationPrefs,
  users,
  type UserRow,
} from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import {
  generateSessionToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "../lib/crypto";
import {
  activitySchema,
  authResponseSchema,
  errorResponse,
  jsonContent,
  myJoinRequestSchema,
  okSchema,
  unitSchema,
  userSchema,
} from "../lib/responses";
import { serializeUnit, serializeUser } from "../lib/serialize";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 프로필 이미지 상한. 관리자 워커(admins-images.ts)와 같은 기준을 쓴다. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** multipart 본문에서 image 파트를 꺼내 형식·크기를 확인한다. */
async function readImageFile(c: {
  req: { parseBody: () => Promise<Record<string, string | File>> };
}): Promise<File | null> {
  const body = await c.req.parseBody();
  const image = body.image;
  if (!(image instanceof File)) return null;
  if (!IMAGE_EXTENSIONS[image.type]) return null;
  if (image.size > MAX_IMAGE_BYTES) return null;
  return image;
}

async function createSession(
  db: DrizzleD1Database,
  userId: string,
): Promise<string> {
  const token = generateSessionToken();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  });
  return token;
}

const signupRoute = createRoute({
  method: "post",
  path: "/signup",
  tags: ["인증"],
  summary: "회원가입",
  request: {
    body: {
      content: { "application/json": { schema: signupSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(authResponseSchema, "가입 성공 (세션 토큰 포함)"),
    400: errorResponse("입력값 오류"),
    409: errorResponse("이미 가입된 이메일"),
  },
});

const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["인증"],
  summary: "로그인",
  request: {
    body: {
      content: { "application/json": { schema: loginSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(authResponseSchema, "로그인 성공"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("이메일 또는 비밀번호 불일치"),
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["인증"],
  summary: "로그아웃",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "로그아웃 완료"),
    401: errorResponse("인증 실패"),
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["인증"],
  summary: "내 정보 (계산된 현재 계급, 소속 부대 포함)",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({
        user: userSchema,
        unit: unitSchema.nullable(),
        joinRequest: myJoinRequestSchema.nullable(),
      }),
      "내 정보",
    ),
    401: errorResponse("인증 실패"),
  },
});

const activityRoute = createRoute({
  method: "get",
  path: "/activity",
  tags: ["인증"],
  summary: "내 접속·푸시 기록 열람 (개인정보 열람권)",
  description:
    "동의 하에 수집된 내 접속 기록과 푸시 발송·수신 로그를 최근 순으로 최대 50건씩 돌려줍니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(activitySchema, "내 기록"),
    401: errorResponse("인증 실패"),
  },
});

const updateProfileRoute = createRoute({
  method: "patch",
  path: "/me",
  tags: ["인증"],
  summary: "내 정보 수정 (별칭·군 종류·입대일·전역예정일·계급)",
  description:
    "보낸 항목만 바꿉니다. 표시 계급은 입대일에서 다시 계산되므로, 입대일을 바꾸면 계급 표시도 함께 바뀝니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: profileUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ user: userSchema }), "수정된 내 정보"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

const changePasswordRoute = createRoute({
  method: "post",
  path: "/me/password",
  tags: ["인증"],
  summary: "비밀번호 변경",
  description:
    "현재 비밀번호를 확인한 뒤 바꿉니다. 성공하면 기존 세션이 모두 끊기고 새 토큰을 돌려줍니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: passwordChangeSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(
      z.object({ token: z.string() }),
      "변경 완료. 이 기기에서 계속 쓸 새 토큰",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패 또는 현재 비밀번호 불일치"),
  },
});

const deleteAccountRoute = createRoute({
  method: "delete",
  path: "/account",
  tags: ["인증"],
  summary: "계정 삭제 (관련 데이터 전체 삭제)",
  description:
    "내 계정과 등록한 휴가·알림·세션·접속/푸시 기록·프로필 이미지를 모두 삭제합니다. 되돌릴 수 없습니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
  },
});

const app = createApp();
// 비밀번호 무차별 대입과 이메일 열거를 막는다. 계정 생성도 같은 이유로 제한한다.
app.use("/login", rateLimit({ name: "login", limit: 10, windowSeconds: 600 }));
app.use(
  "/signup",
  rateLimit({ name: "signup", limit: 10, windowSeconds: 600 }),
);
app.use("/logout", authMiddleware);
app.use("/me", authMiddleware);
app.use("/me/password", authMiddleware);
app.use("/me/image", authMiddleware);
app.use("/activity", authMiddleware);
app.use("/account", authMiddleware);

export const authRoutes = app
  .openapi(signupRoute, async (c) => {
    const input = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .get();
    if (existing) {
      return c.json({ error: "이미 가입된 이메일입니다" }, 409);
    }

    const { hash, salt } = await hashPassword(input.password);
    const user: UserRow = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: hash,
      passwordSalt: salt,
      name: input.name,
      branch: input.branch,
      enlistedAt: input.enlistedAt,
      dischargeAt: input.dischargeAt,
      signupRank: input.rank,
      profileImageKey: null,
      unitId: null,
      expoPushToken: null,
      // 가입 시 개인정보 수집·이용에 동의했음을 기록 (동의는 스키마에서 필수)
      consentedAt: input.dataConsent ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    };
    await db.insert(users).values(user);
    // 군별 기본 연가를 만기 없는 적립분 한 건으로 심는다. 사용자가 보유 휴가 화면에서
    // 자유롭게 고칠 수 있는 제안값이다.
    await db.insert(leaveGrants).values({
      id: crypto.randomUUID(),
      userId: user.id,
      balanceKey: "annual",
      days: DEFAULT_ANNUAL_DAYS[user.branch],
      grantedOn: null,
      expiresOn: null,
      note: null,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    });
    const token = await createSession(db, user.id);
    return c.json({ token, user: serializeUser(user) }, 201);
  })
  .openapi(loginRoute, async (c) => {
    const input = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .get();
    if (
      !user ||
      !(await verifyPassword(
        input.password,
        user.passwordSalt,
        user.passwordHash,
      ))
    ) {
      return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
    }

    const token = await createSession(db, user.id);
    return c.json({ token, user: serializeUser(user) }, 200);
  })
  .openapi(logoutRoute, async (c) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const db = drizzle(c.env.DB);
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256Hex(token)));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(meRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    let unit = null;
    if (user.unitId) {
      const row = await db
        .select()
        .from(units)
        .where(eq(units.id, user.unitId))
        .get();
      if (row) {
        const memberCount = await db.$count(users, eq(users.unitId, row.id));
        unit = serializeUnit(row, memberCount);
      }
    }

    // 초대코드 가입은 즉시 완료되므로 대기 상태는 더 이상 만들지 않는다.
    const joinRequest = null;
    return c.json({ user: serializeUser(user), unit, joinRequest }, 200);
  })
  .openapi(updateProfileRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    // 부분 수정이라 날짜 선후 검사는 기존 값과 합친 뒤에야 할 수 있다.
    const next: UserRow = {
      ...user,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.branch !== undefined ? { branch: input.branch } : {}),
      ...(input.enlistedAt !== undefined
        ? { enlistedAt: input.enlistedAt }
        : {}),
      ...(input.dischargeAt !== undefined
        ? { dischargeAt: input.dischargeAt }
        : {}),
      ...(input.rank !== undefined ? { signupRank: input.rank } : {}),
    };
    if (next.enlistedAt >= next.dischargeAt) {
      return c.json({ error: "전역 예정일은 입대일보다 뒤여야 합니다" }, 400);
    }

    await db
      .update(users)
      .set({
        name: next.name,
        branch: next.branch,
        enlistedAt: next.enlistedAt,
        dischargeAt: next.dischargeAt,
        signupRank: next.signupRank,
      })
      .where(eq(users.id, user.id));

    // 부대 달력 캐시에는 별칭과 계급 라벨이 박혀 있다. 표시 계급은 입대일에서
    // 파생하므로 이름·계급·입대일 중 하나만 바뀌어도 캐시를 새로 발급해야 한다.
    const affectsCalendar =
      next.name !== user.name ||
      next.signupRank !== user.signupRank ||
      next.enlistedAt !== user.enlistedAt;
    if (user.unitId && affectsCalendar) {
      await bumpUnitVersion(c.env.CACHE, user.unitId);
    }

    return c.json({ user: serializeUser(next) }, 200);
  })
  .openapi(changePasswordRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const valid = await verifyPassword(
      input.currentPassword,
      user.passwordSalt,
      user.passwordHash,
    );
    if (!valid) {
      return c.json({ error: "현재 비밀번호가 올바르지 않습니다" }, 401);
    }

    const { hash, salt } = await hashPassword(input.newPassword);
    await db
      .update(users)
      .set({ passwordHash: hash, passwordSalt: salt })
      .where(eq(users.id, user.id));

    // 비밀번호가 새면 이미 붙어 있던 세션도 같이 끊어야 의미가 있다. 전부 지우고
    // 이 기기용으로 새 토큰을 발급해, 다른 기기만 로그아웃되게 한다.
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    const token = await createSession(db, user.id);
    return c.json({ token }, 200);
  })
  .openapi(activityRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [access, push] = await Promise.all([
      db
        .select()
        .from(accessLogs)
        .where(eq(accessLogs.userId, user.id))
        .orderBy(desc(accessLogs.createdAt))
        .limit(50)
        .all(),
      db
        .select()
        .from(pushLogs)
        .where(eq(pushLogs.userId, user.id))
        .orderBy(desc(pushLogs.createdAt))
        .limit(50)
        .all(),
    ]);
    return c.json(
      {
        accessLogs: access.map((r) => ({
          id: r.id,
          method: r.method,
          path: r.path,
          status: r.status,
          platform: r.platform,
          appVersion: r.appVersion,
          durationMs: r.durationMs,
          createdAt: r.createdAt,
        })),
        pushLogs: push.map((r) => ({
          id: r.id,
          notificationId: r.notificationId,
          direction: r.direction,
          status: r.status,
          createdAt: r.createdAt,
        })),
      },
      200,
    );
  })
  .openapi(deleteAccountRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    // R2에 저장된 프로필 이미지 삭제
    if (user.profileImageKey) {
      await c.env.BUCKET.delete(user.profileImageKey).catch(() => {});
    }

    // 탈퇴자가 관리자면 부대가 관리자 없이 남지 않도록 먼저 정리한다.
    // (남은 부대원이 있으면 이관, 혼자였다면 빈 부대를 삭제)
    if (user.unitId) {
      const unit = await db
        .select()
        .from(units)
        .where(eq(units.id, user.unitId))
        .get();
      if (unit && unit.adminId === user.id) {
        const heir = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.unitId, user.unitId), ne(users.id, user.id)))
          .orderBy(asc(users.createdAt))
          .get();
        if (heir) {
          await db
            .update(units)
            .set({ adminId: heir.id })
            .where(eq(units.id, user.unitId));
        } else {
          await db
            .delete(unitInvites)
            .where(eq(unitInvites.unitId, user.unitId));
          await db.delete(units).where(eq(units.id, user.unitId));
          if (unit.imageKey) {
            await c.env.BUCKET.delete(unit.imageKey).catch(() => {});
          }
        }
      }
    }

    // 관련 데이터를 명시적으로 모두 삭제한다.
    // (Cloudflare D1은 외래키 ON DELETE CASCADE 적용을 보장하지 않으므로 직접 지운다.)
    await db.delete(leaves).where(eq(leaves.userId, user.id));
    await db.delete(notifications).where(eq(notifications.userId, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await db.delete(accessLogs).where(eq(accessLogs.userId, user.id));
    await db.delete(pushLogs).where(eq(pushLogs.userId, user.id));
    await db
      .delete(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, user.id));
    // 내가 건 차단과 남이 나를 건 차단 모두 지운다. 남으면 없는 id를 계속 숨긴다.
    await db.delete(userBlocks).where(eq(userBlocks.userId, user.id));
    await db.delete(userBlocks).where(eq(userBlocks.blockedUserId, user.id));
    // 접수된 신고 자체는 운영 증적으로 남기되 신고자 식별자는 끊는다.
    await db
      .update(contentReports)
      .set({ reporterId: null })
      .where(eq(contentReports.reporterId, user.id));
    await db.delete(users).where(eq(users.id, user.id));

    // 부대원 수 변동 → 해당 부대 달력 통계 캐시 무효화
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);

    return c.json({ ok: true as const }, 200);
  })
  /**
   * 프로필 이미지 — 업로드·열람·삭제.
   *
   * multipart와 바이너리 스트림이라 zod-openapi(createRoute)의 JSON 스키마
   * 모델에 얹기 어렵다. OpenAPIHono는 Hono를 상속하므로 평범한 메서드로 붙여도
   * RPC 타입(AppType)에는 그대로 실린다. 그래서 여기만 createRoute를 쓰지 않는다.
   *
   * 내 이미지만 다룬다 — 키를 쿼리로 받지 않으므로 남의 오브젝트를 넘볼 수 없다.
   */
  .put("/me/image", async (c) => {
    const image = await readImageFile(c);
    if (!image) {
      return c.json(
        {
          error: "5MB 이하의 JPEG, PNG, WebP, GIF, AVIF 이미지를 선택해주세요",
        },
        400,
      );
    }
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const key = `profiles/${user.id}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[image.type]}`;
    await c.env.BUCKET.put(key, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: { uploadedBy: user.id, source: "app" },
    });
    await db
      .update(users)
      .set({ profileImageKey: key })
      .where(eq(users.id, user.id));
    // 이전 오브젝트는 참조가 끊긴 뒤에 지운다. 실패해도 요청은 성공으로 둔다.
    if (user.profileImageKey) {
      await c.env.BUCKET.delete(user.profileImageKey).catch(() => undefined);
    }
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    return c.json({ profileImageKey: key }, 200);
  })
  .get("/me/image", async (c) => {
    const user = c.get("user");
    if (!user.profileImageKey) {
      return c.json({ error: "등록된 프로필 이미지가 없습니다" }, 404);
    }
    const object = await c.env.BUCKET.get(user.profileImageKey);
    if (!object) {
      return c.json({ error: "이미지를 찾을 수 없습니다" }, 404);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    // 개인 이미지라 공용 캐시에 남기지 않는다.
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  })
  .delete("/me/image", async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db
      .update(users)
      .set({ profileImageKey: null })
      .where(eq(users.id, user.id));
    if (user.profileImageKey) {
      await c.env.BUCKET.delete(user.profileImageKey).catch(() => undefined);
    }
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    return c.json({ ok: true as const }, 200);
  });
