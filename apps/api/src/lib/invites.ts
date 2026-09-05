/**
 * 그룹 초대코드 발급.
 *
 * 사용처: 그룹 생성(POST /units), 초대코드 재발급(POST /units/{id}/invite).
 *
 * 이 서비스에는 그룹 검색이 없다. 그룹에 들어오는 유일한 길이 초대코드이므로,
 * 서버에는 해시만 남긴다. 원문은 발급 응답에 딱 한 번 실려 나가고 다시는 볼 수 없다.
 *
 * 코드가 사람이 받아 적을 수 있는 6자로 짧아졌으므로(`@leave/shared`의
 * `invite-code.ts`), 아래 두 기본값과 `POST /units/join`의 레이트리밋이 함께
 * 그 길이를 떠받친다. **셋 중 하나만 느슨하게 바꾸지 말 것.**
 */
import { unitInvites } from "../db/schema";
import { generateInviteCode, sha256Hex } from "./crypto";
import type { Db } from "./db";

/**
 * 만료 시각을 지정하지 않으면 24시간.
 *
 * 예전에는 7일이었다. 코드가 6자가 된 뒤로는 "살아 있는 코드가 얼마나 오래
 * 존재하는가"가 곧 추측 공격에 주어지는 시간이라 하루로 줄였다. 초대는 보통
 * 보낸 그날 쓰인다.
 */
export const DEFAULT_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * 사용 횟수를 지정하지 않으면 20회.
 *
 * 예전에는 100회였다. 한 부대가 한 번에 100명을 받는 일은 없고, 남은 횟수는
 * 그대로 "맞히면 들어갈 수 있는 자리"다. 모자라면 관리자가 재발급하면 된다.
 */
export const DEFAULT_INVITE_MAX_USES = 20;

/**
 * 해시 충돌로 다시 뽑는 최대 횟수.
 *
 * 192비트였을 때는 필요 없었다. 10.7억 가지에서는 살아 있는 초대가 수만 건만
 * 돼도 생일 문제로 실제 충돌이 난다 — 그때 `unit_invites_code_hash_unique`가
 * 던지는 오류를 그대로 500으로 내보내면, 그룹을 만들려던 사람이 이유 없이 실패한다.
 */
const CODE_COLLISION_RETRIES = 5;

/** 만료 시각 후보를 ISO 문자열로 정규화한다(미지정이면 기본 TTL). */
export function resolveInviteExpiry(explicit: string | undefined): string {
  return explicit !== undefined
    ? new Date(explicit).toISOString()
    : new Date(Date.now() + DEFAULT_INVITE_TTL_MS).toISOString();
}

/**
 * 새 초대코드를 만들어 저장하고, 한 번만 노출되는 원문을 돌려준다.
 *
 * 이미 쓰이고 있는 코드와 부딪히면 다시 뽑는다. "조회하고 없으면 넣는다"로 하지
 * 않는 이유는 동시 요청 두 건 사이에서 반드시 깨지기 때문이다 — 유일성은
 * `unit_invites_code_hash_unique` 인덱스가 지키고, 여기서는 그 오류를 받아 다시 뽑는다.
 */
export async function createInvite(
  db: Db,
  input: {
    unitId: string;
    createdBy: string;
    expiresAt: string;
    maxUses: number;
  },
) {
  for (let attempt = 0; ; attempt += 1) {
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
    try {
      await db.insert(unitInvites).values(row);
    } catch (caught) {
      if (attempt < CODE_COLLISION_RETRIES && isCodeCollision(caught)) continue;
      throw caught;
    }
    return {
      code,
      expiresAt: row.expiresAt,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
    };
  }
}

/**
 * 코드 해시 유니크 인덱스 위반인가.
 *
 * D1은 구조화된 오류 코드를 주지 않고 SQLite 메시지를 문자열로 넘긴다.
 * 인덱스 이름까지 함께 확인해, 다른 제약 위반을 조용히 재시도하지 않는다.
 */
function isCodeCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("unit_invites.code_hash")
  );
}
