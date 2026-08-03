/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare KV 기반 캐시 유틸.
 *
 * 부대 달력은 여러 D1 조회 + 출타 인원 계산이 필요한 읽기 위주 응답이라 KV로 캐싱한다.
 * 무효화는 "부대별 버전 토큰"으로 처리한다 — 휴가/부대원이 바뀌면 버전을 새로 발급해
 * 이전 버전이 포함된 캐시 키를 더 이상 조회하지 않게 만든다(남은 키는 TTL로 자연 소멸).
 *
 * KV는 최종 일관성을 가지므로 버전 갱신이 즉시 전파되지 않을 수 있다.
 * 그러나 캐시 TTL이 짧아(기본 60초) 최악의 지연도 그 범위를 넘지 않는다.
 */

const CALENDAR_TTL_SECONDS = 60;

function versionKey(unitId: string): string {
  return `unitver:${unitId}`;
}

// 접두사의 숫자는 캐시 페이로드 형식 버전이다. 응답 형태가 바뀌면 올려서
// 배포 직후 TTL이 남은 구형 캐시가 나가지 않게 한다.
function calendarKey(unitId: string, version: string, month: string): string {
  return `calendar2:${unitId}:${version}:${month}`;
}

/** 현재 부대 캐시 버전 토큰(없으면 초기값). */
async function unitVersion(
  cache: KVNamespace,
  unitId: string,
): Promise<string> {
  return (await cache.get(versionKey(unitId))) ?? "init";
}

/**
 * 부대 캐시 버전을 새로 발급한다. 휴가/부대원 변경 후 호출하면
 * 이전 버전으로 저장된 달력 캐시가 모두 무효화된다.
 */
export async function bumpUnitVersion(
  cache: KVNamespace,
  unitId: string,
): Promise<void> {
  try {
    await cache.put(versionKey(unitId), crypto.randomUUID());
  } catch (err) {
    console.error("캐시 버전 갱신 실패", err);
  }
}

/** 캐시된 달력 응답(JSON)을 반환. 미스면 null. */
export async function getCachedCalendar<T>(
  cache: KVNamespace,
  unitId: string,
  month: string,
): Promise<T | null> {
  try {
    const version = await unitVersion(cache, unitId);
    return await cache.get<T>(calendarKey(unitId, version, month), "json");
  } catch (err) {
    console.error("달력 캐시 조회 실패", err);
    return null;
  }
}

/** 달력 응답을 현재 버전으로 캐싱(TTL 적용). 실패해도 응답에는 영향 없음. */
export async function putCachedCalendar(
  cache: KVNamespace,
  unitId: string,
  month: string,
  payload: unknown,
): Promise<void> {
  try {
    const version = await unitVersion(cache, unitId);
    await cache.put(
      calendarKey(unitId, version, month),
      JSON.stringify(payload),
      {
        expirationTtl: CALENDAR_TTL_SECONDS,
      },
    );
  } catch (err) {
    console.error("달력 캐시 저장 실패", err);
  }
}
