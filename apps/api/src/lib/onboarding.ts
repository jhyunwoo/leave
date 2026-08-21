/**
 * 온보딩 — 계정을 만든 사람이 서비스를 실제로 쓸 수 있는 상태가 되기까지.
 *
 * 사용처: `/auth/onboarding*`, `/auth/signup` (routes/auth.ts).
 *
 * 진행 상태를 기기에 두지 않고 서버가 가진 값에서 매번 다시 읽는다. 그래서 앱을
 * 껐다 켜도, 기기를 바꿔도 같은 자리에서 이어진다. 어느 단계로 보낼지 고르는 것은
 * 순수 함수 `onboardingResumeStep`(@leave/shared)이고, 여기서는 그 함수가 볼
 * 재료를 DB에서 모으고 저장하는 일만 한다.
 */

import {
  DEFAULT_ANNUAL_DAYS,
  type OnboardingProfileInput,
} from "@leave/shared";
import { and, eq } from "drizzle-orm";
import {
  leaveGrants,
  regularOvernightConfigs,
  users,
  type RegularOvernightConfigRow,
  type UserRow,
} from "../db/schema";
import type { Db } from "./db";

/**
 * 가입 시 이름·복무 정보를 받지 않았을 때 넣어 두는 자리표시 값.
 * "아직 안 받았다"를 별도 컬럼 없이 표현한다. 이 값이면 프로필이 없는 것으로 본다.
 */
const PLACEHOLDER_ENLISTED_AT = "2000-01-01";
export const PLACEHOLDER_PROFILE = {
  name: "",
  enlistedAt: PLACEHOLDER_ENLISTED_AT,
  dischargeAt: "2000-01-02",
} as const;

/** 사용자가 아직 복무 정보를 채우지 않았는가. */
function hasPlaceholderProfile(user: UserRow): boolean {
  return !user.name || user.enlistedAt === PLACEHOLDER_ENLISTED_AT;
}

/**
 * 군별 기본 연가를 만기 없는 적립분 한 건으로 심는다.
 *
 * 규정이 아니라 사용자가 보유 휴가 화면에서 자유롭게 고칠 수 있는 제안값이다.
 * 가입과 온보딩 완료 두 경로에서 모두 필요한데, 두 번 심으면 연가가 두 배가 되므로
 * 이미 있으면 아무것도 하지 않는다.
 */
export async function ensureDefaultAnnualGrant(
  db: Db,
  user: { id: string; branch: UserRow["branch"] },
): Promise<void> {
  const existing = await db
    .select({ id: leaveGrants.id })
    .from(leaveGrants)
    .where(
      and(
        eq(leaveGrants.userId, user.id),
        eq(leaveGrants.balanceKey, "annual"),
      ),
    )
    .get();
  if (existing) return;

  const now = new Date().toISOString();
  await db.insert(leaveGrants).values({
    id: crypto.randomUUID(),
    userId: user.id,
    balanceKey: "annual",
    days: DEFAULT_ANNUAL_DAYS[user.branch],
    grantedOn: null,
    expiresOn: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** 이어하기 화면이 필요로 하는 현재 상태. */
export async function readOnboardingStatus(db: Db, user: UserRow) {
  const config = await db
    .select()
    .from(regularOvernightConfigs)
    .where(eq(regularOvernightConfigs.userId, user.id))
    .get();

  return serializeOnboardingStatus(user, config);
}

/**
 * 저장 행을 온보딩 응답으로 바꾼다. 인증 부트스트랩은 부대 조회와 설정 조회를
 * 한 D1 batch에 묶은 뒤 같은 직렬화를 재사용한다.
 */
export function serializeOnboardingStatus(
  user: UserRow,
  config: RegularOvernightConfigRow | undefined,
) {
  return {
    completed: Boolean(user.onboardingCompletedAt),
    profile: hasPlaceholderProfile(user)
      ? null
      : {
          name: user.name,
          branch: user.branch,
          enlistedAt: user.enlistedAt,
          dischargeAt: user.dischargeAt,
          rank: user.signupRank,
        },
    regularOvernight: config
      ? {
          enabled: config.enabled,
          startDate: config.startDate,
          intervalDays: config.intervalDays,
          daysPerGrant: config.daysPerGrant,
        }
      : null,
    unitId: user.unitId,
  };
}

/**
 * 복무 정보를 저장한다.
 *
 * 육군을 고르면 정기외박 자동 적립 설정을 꺼진 상태로 되돌린다 — 해·공군에서만
 * 쓰는 기능이라(saveRegularOvernightConfig), 군종을 바꾸고 돌아왔을 때 이전 군종의
 * 설정이 남아 있으면 계산에 섞인다.
 */
export async function saveOnboardingProfile(
  db: Db,
  user: UserRow,
  input: OnboardingProfileInput,
): Promise<void> {
  await db
    .update(users)
    .set({
      name: input.name,
      branch: input.branch,
      enlistedAt: input.enlistedAt,
      dischargeAt: input.dischargeAt,
      signupRank: input.rank,
    })
    .where(eq(users.id, user.id));

  if (input.branch === "army") {
    const cleared = {
      enabled: false,
      startDate: null,
      intervalDays: null,
      daysPerGrant: null,
      updatedAt: new Date().toISOString(),
    };
    await db
      .insert(regularOvernightConfigs)
      .values({ userId: user.id, ...cleared })
      .onConflictDoUpdate({
        target: regularOvernightConfigs.userId,
        set: cleared,
      });
  }
}

/**
 * 온보딩을 마쳤다고 표시한다.
 *
 * 복무 정보가 없거나 앞뒤가 뒤집힌 채로 완료되면 이후 모든 계산(계급·주기·잔여)이
 * 말이 안 되므로 여기서 막는다. 재호출은 성공으로 두되 연가를 다시 심지 않는다.
 */
export async function completeOnboarding(
  db: Db,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (
    !user ||
    hasPlaceholderProfile(user) ||
    user.enlistedAt >= user.dischargeAt
  ) {
    return { ok: false, error: "복무정보를 먼저 완료해주세요" };
  }

  await ensureDefaultAnnualGrant(db, user);
  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date().toISOString() })
    .where(eq(users.id, user.id));
  return { ok: true };
}
