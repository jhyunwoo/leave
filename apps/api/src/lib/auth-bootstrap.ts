/**
 * 인증된 웹 앱이 첫 화면을 그리는 데 필요한 온보딩 상태와 내 정보를 한 번에 읽는다.
 *
 * 기존 `/auth/onboarding`, `/auth/me`는 네이티브와 외부 클라이언트 호환을 위해
 * 그대로 둔다. 이 조립기는 완료 사용자의 설정·부대·인원수를 한 D1 batch로 묶어
 * HTTP 왕복을 합치면서 서버 내부 왕복도 늘리지 않는다.
 */
import { eq, sql } from "drizzle-orm";
import {
  regularOvernightConfigs,
  units,
  users,
  type UserRow,
} from "../db/schema";
import type { Db } from "./db";
import { readOnboardingStatus, serializeOnboardingStatus } from "./onboarding";
import { serializeUnit, serializeUser } from "./serialize";

export async function buildAuthBootstrap(db: Db, user: UserRow) {
  if (!user.onboardingCompletedAt) {
    return {
      onboarding: await readOnboardingStatus(db, user),
      me: null,
    };
  }

  if (!user.unitId) {
    return {
      onboarding: await readOnboardingStatus(db, user),
      me: {
        user: serializeUser(user),
        unit: null,
        joinRequest: null,
      },
    };
  }

  const [configs, unitRows, countRows] = await db.batch([
    db
      .select()
      .from(regularOvernightConfigs)
      .where(eq(regularOvernightConfigs.userId, user.id)),
    db.select().from(units).where(eq(units.id, user.unitId)),
    db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users)
      .where(eq(users.unitId, user.unitId)),
  ]);
  const unit = unitRows[0];

  return {
    onboarding: serializeOnboardingStatus(user, configs[0]),
    me: {
      user: serializeUser(user),
      unit: unit ? serializeUnit(unit, countRows[0]?.count ?? 0) : null,
      joinRequest: null,
    },
  };
}
