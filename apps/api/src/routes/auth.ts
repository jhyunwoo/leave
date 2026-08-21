/**
 * 인증·프로필 라우트 핸들러.
 *
 * 마운트 위치: `/auth` (apps/api/src/index.ts).
 * 명세는 ./auth.contract.ts, 여러 표를 함께 건드리는 작업은 아래 lib에 있다.
 *  - 세션 발급   → lib/sessions.ts
 *  - 온보딩      → lib/onboarding.ts
 *  - 회원 탈퇴   → lib/delete-account.ts
 *
 * 여기 남긴 것은 "요청을 받아 권한을 확인하고 위 작업을 부르고 응답을 고르는" 흐름뿐이다.
 */

import type {
  LoginInput,
  ProfileUpdateInput,
  SignupInput,
} from "@leave/shared";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  accessLogs,
  pushLogs,
  sessions,
  users,
  type UserRow,
} from "../db/schema";
import { createApp } from "../lib/app";
import { buildAuthBootstrap } from "../lib/auth-bootstrap";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { deleteAccount } from "../lib/delete-account";
import { leaveRuleMessage } from "../lib/errors";
import { saveRegularOvernightConfig } from "../lib/leave-balances";
import {
  completeOnboarding,
  ensureDefaultAnnualGrant,
  PLACEHOLDER_PROFILE,
  readOnboardingStatus,
  saveOnboardingProfile,
} from "../lib/onboarding";
import { serializeUser } from "../lib/serialize";
import { serializeUnitById } from "../lib/unit-access";
import { createSession } from "../lib/sessions";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  activityRoute,
  authBootstrapRoute,
  changePasswordRoute,
  deleteAccountRoute,
  loginRoute,
  logoutRoute,
  meRoute,
  onboardingCompleteRoute,
  onboardingProfileRoute,
  onboardingRegularRoute,
  onboardingStatusRoute,
  signupRoute,
  updateProfileRoute,
} from "./auth.contract";

/** 내 기록 열람에서 한 번에 돌려주는 최대 건수(종류별). */
const ACTIVITY_LOG_LIMIT = 50;

/**
 * 가입 입력으로 사용자 행을 만든다.
 *
 * 가입 화면에서 복무 정보를 함께 받는 경로와 계정만 먼저 만드는 경로가 있어,
 * 이름이 없으면 자리표시 값을 넣고 온보딩 미완료 상태로 둔다.
 */
function newUserRow(input: SignupInput): UserRow {
  const now = new Date().toISOString();
  const hasProfile = input.name !== undefined;
  return {
    id: crypto.randomUUID(),
    email: input.email,
    passwordHash: "",
    passwordSalt: "",
    name: input.name ?? PLACEHOLDER_PROFILE.name,
    branch: input.branch ?? "army",
    enlistedAt: input.enlistedAt ?? PLACEHOLDER_PROFILE.enlistedAt,
    dischargeAt: input.dischargeAt ?? PLACEHOLDER_PROFILE.dischargeAt,
    signupRank: input.rank ?? "private",
    unitId: null,
    expoPushToken: null,
    // 가입 시 개인정보 수집·이용에 동의했음을 기록 (동의는 스키마에서 필수)
    consentedAt: input.dataConsent ? now : null,
    onboardingCompletedAt: hasProfile ? now : null,
    createdAt: now,
  };
}

/**
 * 부분 수정 입력을 현재 값 위에 얹는다.
 * 날짜 선후 검사는 합친 뒤에야 할 수 있어 여기서 한 번에 만든다.
 */
function mergeProfile(user: UserRow, input: ProfileUpdateInput): UserRow {
  return {
    ...user,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    ...(input.enlistedAt !== undefined ? { enlistedAt: input.enlistedAt } : {}),
    ...(input.dischargeAt !== undefined
      ? { dischargeAt: input.dischargeAt }
      : {}),
    ...(input.rank !== undefined ? { signupRank: input.rank } : {}),
  };
}

const app = createApp();
// 비밀번호 무차별 대입과 이메일 열거를 막는다. 계정 생성도 같은 이유로 제한한다.
app.use("/login", rateLimit({ name: "login", limit: 10, windowSeconds: 600 }));
app.use(
  "/signup",
  rateLimit({ name: "signup", limit: 10, windowSeconds: 600 }),
);
app.use("/logout", authMiddleware);
app.use("/bootstrap", authMiddleware);
app.use("/me", authMiddleware);
app.use("/me/password", authMiddleware);
// `/onboarding/*`만으로 `/onboarding` 자신까지 매치된다. 두 줄을 다 두면
// 인증 미들웨어가 한 요청에서 두 번 돌아 세션 조회(D1 왕복 + SHA-256)가 그대로 두 배가 된다.
app.use("/onboarding/*", authMiddleware);
app.use("/activity", authMiddleware);
app.use("/account", authMiddleware);

export const authRoutes = app
  .openapi(signupRoute, async (c) => {
    const input: SignupInput = c.req.valid("json");
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
    const user = {
      ...newUserRow(input),
      passwordHash: hash,
      passwordSalt: salt,
    };
    await db.insert(users).values(user);

    // 복무 정보를 함께 받은 경우에만 심는다. 나머지는 온보딩 완료 시점에 들어간다.
    if (user.onboardingCompletedAt) await ensureDefaultAnnualGrant(db, user);

    const token = await createSession(db, user.id);
    const onboardingCompleted = Boolean(user.onboardingCompletedAt);
    return c.json(
      {
        token,
        user: onboardingCompleted ? serializeUser(user) : null,
        onboardingCompleted,
      },
      201,
    );
  })
  .openapi(loginRoute, async (c) => {
    const input: LoginInput = c.req.valid("json");
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
    return c.json(
      {
        token,
        user: user.onboardingCompletedAt ? serializeUser(user) : null,
        onboardingCompleted: Boolean(user.onboardingCompletedAt),
      },
      200,
    );
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
  .openapi(authBootstrapRoute, async (c) => {
    return c.json(
      await buildAuthBootstrap(drizzle(c.env.DB), c.get("user")),
      200,
    );
  })
  .openapi(meRoute, async (c) => {
    const user = c.get("user");
    if (!user.onboardingCompletedAt)
      return c.json({ error: "온보딩을 먼저 완료해주세요" }, 428);
    const db = drizzle(c.env.DB);

    // 그룹 행과 인원수를 한 문장으로 읽는다(예전에는 조회 + count로 왕복이 둘이었다).
    const unit = user.unitId ? await serializeUnitById(db, user.unitId) : null;

    // 초대코드 가입은 즉시 완료되므로 대기 상태는 더 이상 만들지 않는다.
    const joinRequest = null;
    return c.json({ user: serializeUser(user), unit, joinRequest }, 200);
  })
  .openapi(onboardingStatusRoute, async (c) => {
    const db = drizzle(c.env.DB);
    return c.json(await readOnboardingStatus(db, c.get("user")), 200);
  })
  .openapi(onboardingProfileRoute, async (c) => {
    const db = drizzle(c.env.DB);
    await saveOnboardingProfile(db, c.get("user"), c.req.valid("json"));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(onboardingRegularRoute, async (c) => {
    const db = drizzle(c.env.DB);
    // 주기 계산이 복무 정보에 기대므로 저장된 최신 값을 다시 읽는다.
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, c.get("user").id))
      .get();
    if (!user || !user.name)
      return c.json({ error: "복무정보를 먼저 저장해주세요" }, 400);
    try {
      await saveRegularOvernightConfig(db, user, c.req.valid("json"));
      return c.json({ ok: true as const }, 200);
    } catch (error) {
      const message = leaveRuleMessage(error);
      if (message === null) throw error;
      return c.json({ error: message }, 400);
    }
  })
  .openapi(onboardingCompleteRoute, async (c) => {
    const result = await completeOnboarding(
      drizzle(c.env.DB),
      c.get("user").id,
    );
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true as const }, 200);
  })
  .openapi(updateProfileRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const next = mergeProfile(user, c.req.valid("json"));
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
    // 두 목록은 서로를 기다릴 이유가 없다 — 한 번의 왕복으로 묶는다.
    const [access, push] = await db.batch([
      db
        .select({
          id: accessLogs.id,
          method: accessLogs.method,
          path: accessLogs.path,
          status: accessLogs.status,
          platform: accessLogs.platform,
          appVersion: accessLogs.appVersion,
          durationMs: accessLogs.durationMs,
          createdAt: accessLogs.createdAt,
        })
        .from(accessLogs)
        .where(eq(accessLogs.userId, user.id))
        .orderBy(desc(accessLogs.createdAt))
        .limit(ACTIVITY_LOG_LIMIT),
      db
        .select({
          id: pushLogs.id,
          notificationId: pushLogs.notificationId,
          direction: pushLogs.direction,
          status: pushLogs.status,
          createdAt: pushLogs.createdAt,
        })
        .from(pushLogs)
        .where(eq(pushLogs.userId, user.id))
        .orderBy(desc(pushLogs.createdAt))
        .limit(ACTIVITY_LOG_LIMIT),
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
    await deleteAccount(drizzle(c.env.DB), c.get("user"));
    return c.json({ ok: true as const }, 200);
  });
