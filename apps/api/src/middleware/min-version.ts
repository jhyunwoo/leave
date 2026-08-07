/**
 * 최소 지원 앱 버전 차단 미들웨어.
 *
 * 사용처: apps/api/src/index.ts (`/`, `/meta`, `/docs`는 제외).
 * 안내 문구를 받아야 하는 경로까지 막으면 사용자가 무엇을 해야 할지 알 수 없다.
 */

import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/app";

/**
 * 최소 지원 버전 차단.
 *
 * 출타 계산 규칙(복귀일 포함 여부, 집계에 들어가는 상태 등)이 바뀌면 구버전 앱은
 * 같은 데이터로 **다른 숫자**를 보여준다. 이 앱에서 틀린 숫자는 곧 잘못된 계획이므로,
 * 규칙이 바뀐 릴리스에서는 MIN_APP_VERSION을 올려 구버전을 막는다.
 *
 * 클라이언트가 버전을 안 보내면(웹, 구버전 헤더 누락) 막지 않는다. 헤더가 없다는
 * 이유로 접근을 끊으면 정상 사용자까지 함께 잠긴다.
 */
const VERSION_PART_RE = /^\d+$/;

/** "1.2.3" 비교. 형식이 어긋나면 비교를 포기하고 통과시킨다. */
export function compareVersions(a: string, b: string): number | null {
  const left = a.split(".");
  const right = b.split(".");
  if (left.length === 0 || right.length === 0) return null;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? "0";
    const r = right[index] ?? "0";
    if (!VERSION_PART_RE.test(l) || !VERSION_PART_RE.test(r)) return null;
    const diff = Number(l) - Number(r);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export const minVersionMiddleware = createMiddleware<AppEnv>(
  async (c, next) => {
    const min = c.env.MIN_APP_VERSION;
    const client = c.req.header("X-Client-Version");
    if (!min || !client) return next();

    const compared = compareVersions(client, min);
    if (compared !== null && compared < 0) {
      return c.json(
        {
          error:
            "앱을 업데이트해야 계속 사용할 수 있어요. 출타 계산 규칙이 바뀌어 이전 버전은 다른 숫자를 보여줍니다.",
          minSupportedVersion: min,
        },
        426,
      );
    }
    return next();
  },
);
