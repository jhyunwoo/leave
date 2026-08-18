/**
 * 코드가 반드시 있다고 믿는 바인딩을 wrangler.jsonc가 실제로 주는지
 * 컴파일 타임에 확인한다.
 *
 * 왜 필요한가: `AppBindings`에 필수로 적어 둔 바인딩을 wrangler.jsonc에서
 * 빼거나 이름을 바꾸면, 타입은 멀쩡한데 배포된 워커에서 `c.env.X`가 undefined가
 * 된다. 첫 요청이 500으로 죽고 나서야 알게 되는 종류다. 여기서 먼저 깨뜨린다.
 *
 * 선택 바인딩(`X?: string`)은 검사하지 않는다 — MIN_APP_VERSION처럼 배포본에는
 * 두지 않고 로컬/테스트에서 `--var`로만 넣는 스위치가 그쪽이다.
 *
 * 왜 별도 파일인가: `WorkerEnv`는 생성물 worker-env.d.ts의 전역 타입이고,
 * `AppBindings`가 있는 src/lib/app.ts는 @leave/client가 `AppType`으로 끌어간다.
 * app.ts가 전역 선언에 기대면 클라이언트 패키지의 타입 검사가 함께 깨진다.
 * src/ 밖에 두는 이유도 같다 — wrangler는 src/index.ts에서만 번들을 만들므로
 * 이 파일은 배포 산출물에도, @leave/client가 끌어가는 타입 그래프에도 들어가지 않는다.
 * (.d.ts로 두면 skipLibCheck 때문에 검사 자체를 건너뛴다.)
 *
 * 생성: `pnpm --filter @leave/api types`
 * 설정↔생성물 어긋남: `pnpm --filter @leave/api types:check`
 */

import type { AppBindings } from "./src/lib/app";

/** 코드가 항상 있다고 가정하는 바인딩(선택 값 제외). */
type RequiredBindings = {
  [
    K in keyof AppBindings as undefined extends AppBindings[K] ? never : K
  ]: AppBindings[K];
};

/** wrangler.jsonc가 주지 않거나 타입이 맞지 않는 필수 바인딩의 이름. */
type BindingsMissingFromWrangler = {
  [K in keyof RequiredBindings]: K extends keyof WorkerEnv
    ? WorkerEnv[K] extends RequiredBindings[K]
      ? never
      : K
    : K;
}[keyof RequiredBindings];

/** 제약을 만족하지 못하면 오류 메시지에 빠진 바인딩 이름이 그대로 찍힌다. */
type Expect<T extends true> = T;

export type NoBindingDrift = Expect<
  BindingsMissingFromWrangler extends never ? true : BindingsMissingFromWrangler
>;
