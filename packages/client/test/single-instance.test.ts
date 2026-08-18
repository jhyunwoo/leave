/**
 * @leave/client를 함께 묶는 앱들이 공유 의존성을 같은 설치본으로 보는지 지킨다.
 *
 * pnpm은 peer 의존성 해석 결과마다 물리적으로 다른 디렉터리를 만든다. 워크스페이스
 * 안에서 React 버전이 갈리면(native 19.2.3 / web 19.2.7) 그것을 peer로 받는
 * @tanstack/react-query도 `@tanstack+react-query@5.101.2_react@19.2.3`과
 * `..._react@19.2.7` 두 벌로 깔린다. 번들러는 파일 위치에서 node_modules를 타고
 * 올라가며 해석하므로 앱 코드는 앞의 것을, @leave/client의 훅은 뒤의 것을 잡는다.
 * 그러면 QueryClientContext가 둘로 갈려 루트의 프로바이더가 채운 컨텍스트를 훅이
 * 읽지 못하고 "No QueryClient set"으로 죽는다. (2026-08-07 OTA에서 네이티브 앱이
 * 실제로 이 이유로 시작하자마자 멈췄다.)
 *
 * 타입 검사도 lint도 못 잡고 번들을 만들어 기기에서 띄워야만 드러나는 종류라,
 * 설치 레이아웃 자체를 검사한다. 버전을 한 줄로 묶는 쪽은 pnpm-workspace.yaml의
 * overrides.
 */

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/** @leave/client를 한 번들 안에 함께 넣는 워크스페이스들. */
const consumers = ["apps/native", "apps/web"];

/**
 * 검사 대상은 peerDependencies에서 그대로 가져온다. peer로 선언했다는 것이 곧
 * "앱과 한 벌을 나눠 쓴다"는 뜻이므로, 나중에 의존성이 늘어도 여기가 같이 따라온다.
 */
const sharedDeps = Object.keys(
  (
    JSON.parse(
      readFileSync(path.join(repoRoot, "packages/client/package.json"), "utf8"),
    ) as { peerDependencies: Record<string, string> }
  ).peerDependencies,
);

/** 심링크를 따라간 실제 설치 경로. 번들러가 모듈 동일성을 판단하는 기준과 같다. */
function installedPath(workspace: string, dep: string) {
  return realpathSync(path.join(repoRoot, workspace, "node_modules", dep));
}

describe("@leave/client와 앱이 같은 모듈 인스턴스를 쓴다", () => {
  for (const workspace of consumers) {
    for (const dep of sharedDeps) {
      it(`${workspace}와 packages/client의 ${dep}가 같은 설치본이다`, () => {
        expect(installedPath("packages/client", dep)).toBe(
          installedPath(workspace, dep),
        );
      });
    }
  }
});
