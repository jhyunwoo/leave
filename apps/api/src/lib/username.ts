/**
 * 사용자 이름의 저장·조회 — DB 쪽 사정만 담는다.
 *
 * 사용처: routes/users.ts (설정·중복 확인·검색·프로필), routes/auth.ts (부트스트랩).
 * 규칙 자체(무엇이 유효한 이름인가, 정규형이 무엇인가)는 @leave/shared/username에
 * 있고 여기서는 그 정규형을 D1에 넣고 꺼내는 방법만 다룬다.
 */

import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { Db } from "./db";

/**
 * 접두어 검색의 상한.
 *
 * `LIKE 'q%'` 대신 `username >= q AND username < upperBound(q)`를 쓴다. 이유는 두 가지다.
 *  - `_`는 사용자 이름에 쓸 수 있는 문자인데 LIKE 패턴에서는 와일드카드다.
 *    `hyunwoo_`로 검색하면 `hyunwoox`까지 걸린다. ESCAPE로 막으면 이번에는
 *    SQLite의 LIKE 최적화가 꺼져 유니크 인덱스를 못 쓰고 전체 스캔이 된다.
 *  - 범위 조회는 인덱스 정렬을 그대로 타므로 `ORDER BY username`에 TEMP B-TREE가
 *    붙지 않고, 정확히 일치하는 이름이 접두어들보다 항상 먼저 나온다
 *    (접두어 P를 가진 문자열 중 P 자신이 가장 짧아 사전순으로 앞선다).
 *
 * 마지막 코드포인트를 하나 올린 값이 상한이다. UTF-8은 코드포인트 순서를 바이트
 * 순서로 보존하고 어떤 인코딩도 다른 인코딩의 접두사가 아니므로, 이 값은 접두어를
 * 가진 모든 문자열보다 반드시 크다. 서로게이트 구간은 문자열로 표현할 수 없어
 * 건너뛰는데, 상한을 더 키우는 방향이라 정확성에 영향이 없다.
 */
export function usernamePrefixUpperBound(prefix: string): string {
  const points = [...prefix];
  const last = points.pop();
  if (last === undefined) {
    throw new Error("빈 접두어로는 범위를 만들 수 없습니다");
  }
  let next = last.codePointAt(0)! + 1;
  if (next >= 0xd800 && next <= 0xdfff) next = 0xe000;
  return points.join("") + String.fromCodePoint(next);
}

/**
 * D1이 올려 보낸 오류가 사용자 이름 유니크 위반인가.
 *
 * 메시지를 보는 것 말고 방법이 없다 — D1은 SQLite 오류를 코드가 아니라 문자열로
 * 준다. 표에 이메일 유니크도 있어 컬럼 이름까지 확인한다. 인덱스 이름
 * (`users_username_idx`)도 함께 보는 이유는 SQLite 버전에 따라 어느 쪽을
 * 메시지에 담는지가 다르기 때문이다.
 *
 * `cause`를 따라 내려가는 이유: drizzle은 실패한 문장을 DrizzleQueryError로 감싸고
 * ("Failed query: update ..."), 진짜 SQLite 메시지는 그 안쪽 cause에 들어 있다.
 * 바깥 메시지만 보면 제약 위반이 전부 500으로 새어 나간다.
 */
function isUsernameConflict(error: unknown): boolean {
  // Error 체인만 따라간다. D1과 drizzle은 항상 Error를 던지고, 그 밖의 것이
  // 올라왔다면 유일성 위반인지 알 방법이 없으므로 500으로 흘려보내는 편이 맞다.
  for (
    let current: unknown = error, depth = 0;
    current instanceof Error && depth < 5;
    depth += 1
  ) {
    const { message } = current;
    if (
      message.includes("UNIQUE constraint failed") &&
      (message.includes("users.username") ||
        message.includes("users_username_idx"))
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export type UsernameClaim = { ok: true } | { ok: false; reason: "taken" };

/**
 * 정규형 이름을 이 사용자에게 붙인다.
 *
 * 먼저 조회해서 비어 있는지 확인하지 않는다 — 확인과 쓰기 사이에 다른 요청이
 * 같은 이름을 가져갈 수 있고, 그 창을 좁힐 수는 있어도 없앨 수는 없다.
 * 그냥 쓰고, 유니크 인덱스가 거절하면 그것을 결과로 바꾼다. 이 함수가 성공했다면
 * 그 시점에 이름은 확실히 이 사용자의 것이다.
 */
export async function claimUsername(
  db: Db,
  userId: string,
  username: string,
): Promise<UsernameClaim> {
  try {
    await db.update(users).set({ username }).where(eq(users.id, userId));
    return { ok: true };
  } catch (error) {
    if (isUsernameConflict(error)) return { ok: false, reason: "taken" };
    throw error;
  }
}

/**
 * 이 이름을 지금 쓸 수 있는가.
 *
 * 결과는 조언일 뿐이다 — 확인과 저장 사이에 남이 가져갈 수 있으므로 최종 판정은
 * 언제나 `claimUsername`의 유니크 인덱스다. 입력 도중 안내를 주려고만 쓴다.
 * 자기가 이미 쓰고 있는 이름은 사용 가능으로 본다(대소문자만 바꾸는 변경 등).
 */
export async function isUsernameAvailable(
  db: Db,
  username: string,
  forUserId: string,
): Promise<boolean> {
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  return !row || row.id === forUserId;
}
