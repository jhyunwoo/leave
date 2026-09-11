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
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  accessLogs,
  pushLogs,
  sessions,
  userPasskeys,
  users,
  type UserRow,
} from "../db/schema";
import { createApp } from "../lib/app";
import { buildAuthBootstrap } from "../lib/auth-bootstrap";
import {
  hashPassword,
  sha256Hex,
  verifyPassword,
  verifyPasswordOrDecoy,
} from "../lib/crypto";
import { deleteAccount } from "../lib/delete-account";
import { readRemainingDutyDays } from "../lib/duty-days";
import { leaveRuleMessage } from "../lib/errors";
import { saveRegularOvernightConfig } from "../lib/leave-balances";
import {
  clearRegularOvernightForBranchChange,
  completeOnboarding,
  ensureDefaultAnnualGrant,
  ensureDefaultOutingConfigs,
  PLACEHOLDER_PROFILE,
  readOnboardingStatus,
  saveOnboardingProfile,
} from "../lib/onboarding";
import { serializeUser } from "../lib/serialize";
import { serializeUnitById } from "../lib/unit-access";
import { createSession } from "../lib/sessions";
import {
  finishAuthentication,
  finishRegistration,
  makeAuthenticationOptions,
  makeRegistrationOptions,
  MAX_PASSKEYS_PER_ACCOUNT,
  passkeyDto,
  USER_PASSKEY_ORIGINS,
} from "../lib/passkeys";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  activityRoute,
  authBootstrapRoute,
  changePasswordRoute,
  deleteAccountRoute,
  dutyDaysRoute,
  loginRoute,
  logoutRoute,
  meRoute,
  onboardingCompleteRoute,
  onboardingProfileRoute,
  onboardingRegularRoute,
  onboardingStatusRoute,
  signupRoute,
  updateProfileRoute,
  passkeyAuthenticationOptionsRoute,
  passkeyAuthenticationVerifyRoute,
  passkeyDeleteRoute,
  passkeyListRoute,
  passkeyRegistrationOptionsRoute,
  passkeyRegistrationVerifyRoute,
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
    // 공개 이름은 서버가 짓지 않는다 — 이메일·별칭에서 파생하면 비공개 정보가
    // 공개 식별자가 된다. 온보딩의 username 단계에서 본인이 정한다(0023).
    username: null,
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
app.use("/me/duty-days", authMiddleware);
// `/onboarding/*`만으로 `/onboarding` 자신까지 매치된다. 두 줄을 다 두면
// 인증 미들웨어가 한 요청에서 두 번 돌아 세션 조회(D1 왕복 + SHA-256)가 그대로 두 배가 된다.
app.use("/onboarding/*", authMiddleware);
app.use("/activity", authMiddleware);
app.use("/account", authMiddleware);
app.use("/passkeys", authMiddleware);
app.use("/passkeys/registration/*", authMiddleware);
app.use("/passkeys/:id", authMiddleware);
app.use(
  "/passkeys/authentication/*",
  rateLimit({ name: "passkey-login", limit: 20, windowSeconds: 600 }),
);

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
    if (user.onboardingCompletedAt) {
      await ensureDefaultAnnualGrant(db, user);
      await ensureDefaultOutingConfigs(db, user);
    }

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
    // 계정이 없어도 PBKDF2를 한 번 돌린다. 여기서 곧장 401로 빠지면 응답 시간이
    // "이 주소로 가입했는가"를 알려준다 — lib/crypto.ts의 verifyPasswordOrDecoy 참고.
    const valid = await verifyPasswordOrDecoy(
      input.password,
      user ? { salt: user.passwordSalt, hash: user.passwordHash } : null,
    );
    if (!user || !valid) {
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
  .openapi(passkeyListRoute, async (c) => {
    const rows = await drizzle(c.env.DB)
      .select()
      .from(userPasskeys)
      .where(eq(userPasskeys.userId, c.get("user").id))
      .orderBy(desc(userPasskeys.createdAt));
    return c.json({ passkeys: rows.map(passkeyDto) }, 200);
  })
  .openapi(passkeyRegistrationOptionsRoute, async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    if (
      !(await verifyPassword(
        input.currentPassword,
        user.passwordSalt,
        user.passwordHash,
      ))
    ) {
      return c.json({ error: "현재 비밀번호가 올바르지 않습니다" }, 400);
    }
    const db = drizzle(c.env.DB);
    const existing = await db
      .select()
      .from(userPasskeys)
      .where(eq(userPasskeys.userId, user.id));
    if (existing.length >= MAX_PASSKEYS_PER_ACCOUNT) {
      return c.json(
        { error: "패스키는 최대 10개까지 등록할 수 있습니다" },
        409,
      );
    }
    return c.json(
      await makeRegistrationOptions({
        db,
        subjectKind: "user",
        subjectId: user.id,
        userName: user.email,
        userDisplayName: user.name,
        name: input.name,
        existing,
      }),
      200,
    );
  })
  .openapi(passkeyRegistrationVerifyRoute, async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const db = drizzle(c.env.DB);
    try {
      const credential = await finishRegistration({
        db,
        ceremonyId: input.ceremonyId,
        subjectKind: "user",
        subjectId: user.id,
        response: input.response as unknown as RegistrationResponseJSON,
        expectedOrigins: USER_PASSKEY_ORIGINS,
      });
      const row = {
        id: crypto.randomUUID(),
        userId: user.id,
        ...credential,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      await db.insert(userPasskeys).values(row);
      return c.json({ passkey: passkeyDto(row) }, 201);
    } catch (error) {
      // 원문 메시지를 그대로 내보내지 않는다. 여기서 던지는 것은
      // `@simplewebauthn`의 검증 문장이거나 D1의 SQLite 오류인데, 둘 다 사용자가
      // 고칠 수 있는 내용이 아니고 인프라 사정이 클라이언트로 새는 경로가 된다
      // (`lib/errors.ts`가 세운 경계와 같은 이유다).
      const message = error instanceof Error ? error.message : "";
      const duplicate =
        message.includes("UNIQUE") || message.includes("unique");
      return c.json(
        {
          error: duplicate
            ? "이미 등록된 패스키입니다"
            : "패스키를 등록하지 못했습니다. 다시 시도해주세요.",
        },
        duplicate ? 409 : 400,
      );
    }
  })
  .openapi(passkeyDeleteRoute, async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    if (
      !(await verifyPassword(
        input.currentPassword,
        user.passwordSalt,
        user.passwordHash,
      ))
    ) {
      return c.json({ error: "현재 비밀번호가 올바르지 않습니다" }, 400);
    }
    const removed = await drizzle(c.env.DB)
      .delete(userPasskeys)
      .where(
        and(
          eq(userPasskeys.id, c.req.valid("param").id),
          eq(userPasskeys.userId, user.id),
        ),
      )
      .returning({ id: userPasskeys.id });
    if (!removed[0]) return c.json({ error: "패스키를 찾을 수 없습니다" }, 404);
    return c.json({ ok: true as const }, 200);
  })
  .openapi(passkeyAuthenticationOptionsRoute, async (c) => {
    return c.json(
      await makeAuthenticationOptions(drizzle(c.env.DB), "user"),
      200,
    );
  })
  .openapi(passkeyAuthenticationVerifyRoute, async (c) => {
    const input = c.req.valid("json");
    const response = input.response as unknown as AuthenticationResponseJSON;
    if (typeof response.id !== "string") {
      return c.json({ error: "패스키 응답이 올바르지 않습니다" }, 400);
    }
    const db = drizzle(c.env.DB);
    const credential = await db
      .select()
      .from(userPasskeys)
      .where(eq(userPasskeys.credentialId, response.id))
      .get();
    if (!credential)
      return c.json({ error: "등록되지 않은 패스키입니다" }, 401);
    try {
      const info = await finishAuthentication({
        db,
        ceremonyId: input.ceremonyId,
        subjectKind: "user",
        response,
        credential,
        expectedOrigins: USER_PASSKEY_ORIGINS,
      });
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, credential.userId))
        .get();
      if (!user) return c.json({ error: "등록되지 않은 패스키입니다" }, 401);
      await db
        .update(userPasskeys)
        .set({ counter: info.newCounter, lastUsedAt: new Date().toISOString() })
        .where(eq(userPasskeys.id, credential.id));
      const token = await createSession(db, user.id);
      return c.json(
        {
          token,
          user: user.onboardingCompletedAt ? serializeUser(user) : null,
          onboardingCompleted: Boolean(user.onboardingCompletedAt),
        },
        200,
      );
    } catch {
      // 등록과 같은 이유로 원문을 내보내지 않는다(위 주석 참고).
      return c.json(
        { error: "패스키를 확인하지 못했습니다. 다시 시도해주세요." },
        400,
      );
    }
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
  .openapi(dutyDaysRoute, async (c) => {
    const user = c.get("user");
    if (!user.onboardingCompletedAt)
      return c.json({ error: "온보딩을 먼저 완료해주세요" }, 428);
    return c.json(await readRemainingDutyDays(drizzle(c.env.DB), user), 200);
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

    // 온보딩과 같은 불변식을 지킨다 — 군마다 주기 단위가 달라 앞 군종의 값이 남으면
    // 적립일이 전부 어긋난다(clearRegularOvernightForBranchChange 주석 참고).
    if (user.branch !== next.branch) {
      await clearRegularOvernightForBranchChange(db, user.id);
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
