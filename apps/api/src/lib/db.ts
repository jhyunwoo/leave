/**
 * D1 + Drizzle 타입 별칭.
 *
 * `DrizzleD1Database`를 파일마다 따로 별칭 짓던 것을 한곳으로 모은다.
 * 헬퍼 함수의 첫 인자 타입은 전부 이 `Db`다.
 */
import type { DrizzleD1Database } from "drizzle-orm/d1";

export type Db = DrizzleD1Database;
