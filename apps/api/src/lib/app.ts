// Workers 런타임 타입(D1Database·KVNamespace)은 apps/api/tsconfig.json의
// `types: ["@cloudflare/workers-types"]`로 들어온다. 여기에 삼중 슬래시 참조를
// 두면 이 파일을 타입으로 가져가는 쪽(@leave/client → 웹·네이티브)까지 Workers
// 전역이 딸려 들어가 브라우저/Node 전역과 충돌한다.
import { OpenAPIHono } from "@hono/zod-openapi";
import type { UserRow } from "../db/schema";

/**
 * 워커가 받는 바인딩.
 *
 * wrangler.jsonc가 실제로 주는 것과 어긋나지 않는지는 생성된 타입과 대조해
 * 컴파일 타임에 확인한다 — apps/api/bindings-drift.d.ts 참고.
 * (여기서 생성 타입을 직접 확장하지 않는 이유: 이 파일의 타입은 @leave/client가
 * AppType으로 가져간다. 전역 선언에 의존하면 클라이언트 쪽 타입 검사가 깨진다.)
 *
 * 뒤의 세 값은 wrangler.jsonc의 vars에 없다 — 배포본에는 설정하지 않고
 * 로컬/테스트에서 `--var`로만 넣는 스위치라 선택 값이다.
 */
export type AppBindings = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  /**
   * 인증 코드 HMAC 키. Resend 키와 따로 두어, 메일 키를 교체해도 대기 중인 코드가
   * 무효가 되지 않고 메일 키가 새어도 저장된 해시를 대조할 수 없게 한다.
   */
  EMAIL_CODE_SECRET?: string;
  EMAIL_FROM?: string;
  /** 기본값은 Resend 공식 API. 로컬 통합 테스트에서는 격리된 메일 서버를 사용한다. */
  RESEND_API_URL?: string;
  // 성능 최적화용 캐시(부대 달력·검색 결과 등). 로컬 dev는 자동으로 로컬 KV를 사용.
  CACHE: KVNamespace;
  CORS_ORIGIN?: string;
  /** 이 버전 미만의 앱은 426으로 막는다. 비우면 차단하지 않는다. */
  MIN_APP_VERSION?: string;
  /** 스토어에 올라간 최신 앱 버전. 업데이트 안내 문구에만 쓴다. */
  LATEST_APP_VERSION?: string;
  /** 카운터별 rate limit 상한 덮어쓰기 JSON (예: `{"signup":10000}`). */
  RATE_LIMITS?: string;
  /** 접속 기록·푸시 로그 보관 일수. 비우면 lib/retention.ts의 기본값을 쓴다. */
  LOG_RETENTION_DAYS?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    /** authMiddleware가 설정. 보호된 라우트에서만 존재. */
    user: UserRow;
  };
};

/** 입력 검증 실패 시 첫 번째 오류 메시지를 400으로 반환하는 공통 훅. */
export function createApp() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        return c.json(
          { error: issue?.message ?? "입력값이 올바르지 않습니다" },
          400,
        );
      }
    },
  });
}
