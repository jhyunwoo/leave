/**
 * 그룹 초대코드 발급.
 *
 * 사용처: 그룹 생성(POST /units), 초대코드 재발급(POST /units/{id}/invite).
 *
 * 이 서비스에는 그룹 검색이 없다. 그룹에 들어오는 유일한 길이 초대코드이므로,
 * 코드는 192비트 CSPRNG 값이고 서버에는 해시만 남긴다. 원문은 발급 응답에
 * 딱 한 번 실려 나가고 다시는 볼 수 없다.
 */
import { unitInvites } from "../db/schema";
import { generateInviteCode, sha256Hex } from "./crypto";
import type { Db } from "./db";

/** 만료 시각을 지정하지 않으면 7일. */
export const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 사용 횟수를 지정하지 않으면 100회. */
export const DEFAULT_INVITE_MAX_USES = 100;

/** 만료 시각 후보를 ISO 문자열로 정규화한다(미지정이면 기본 TTL). */
export function resolveInviteExpiry(explicit: string | undefined): string {
  return explicit !== undefined
    ? new Date(explicit).toISOString()
    : new Date(Date.now() + DEFAULT_INVITE_TTL_MS).toISOString();
}

/** 새 초대코드를 만들어 저장하고, 한 번만 노출되는 원문을 돌려준다. */
export async function createInvite(
  db: Db,
  input: {
    unitId: string;
    createdBy: string;
    expiresAt: string;
    maxUses: number;
  },
) {
  const code = generateInviteCode();
  const row = {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    // 원문 대신 해시만 저장한다. DB가 새도 코드가 그대로 새지는 않는다.
    codeHash: await sha256Hex(code),
    expiresAt: input.expiresAt,
    maxUses: input.maxUses,
    usedCount: 0,
    revokedAt: null,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  await db.insert(unitInvites).values(row);
  return {
    code,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
  };
}
