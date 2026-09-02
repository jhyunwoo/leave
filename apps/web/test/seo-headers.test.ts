/**
 * `public/_headers`가 약속하는 것을 고정한다.
 *
 * 두 가지를 지킨다.
 *  1) SEO 작업이 보안 헤더를 넓히지 않았다.
 *  2) 미리 그린 랜딩의 인라인 스크립트 해시가 실제 스크립트와 같다 —
 *     어긋나면 그 스크립트가 CSP에 막혀 로그인 사용자에게 랜딩이 잠깐 보인다.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SESSION_FLAG_SCRIPT } from "../src/seo/head";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const headers = readFileSync(join(webRoot, "public", "_headers"), "utf8");
const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1]?.trim() ?? "";

describe("CSP", () => {
  it("인라인 스크립트는 해시 하나만 허용한다", () => {
    const digest = createHash("sha256")
      .update(SESSION_FLAG_SCRIPT, "utf8")
      .digest("base64");
    expect(
      csp,
      `_headers의 script-src 해시를 'sha256-${digest}' 로 바꿔야 한다`,
    ).toContain(`'sha256-${digest}'`);
  });

  it("'unsafe-inline'·'unsafe-eval'로 스크립트를 열지 않는다", () => {
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(scriptSrc).not.toContain("*");
  });

  it("기존 방어선을 그대로 둔다", () => {
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
      "connect-src 'self' https://api.leave.moveto.kr",
    ]) {
      expect(csp, directive).toContain(directive);
    }
  });
});

describe("응답 헤더", () => {
  it("보안 헤더가 모두 남아 있다", () => {
    for (const header of [
      "X-Content-Type-Options: nosniff",
      "X-Frame-Options: DENY",
      "Referrer-Policy: strict-origin-when-cross-origin",
      "Strict-Transport-Security: max-age=31536000; includeSubDomains",
      "Cross-Origin-Opener-Policy: same-origin",
      "Permissions-Policy: camera=()",
    ]) {
      expect(headers, header).toContain(header);
    }
  });

  it("robots.txt가 text/plain으로 나간다", () => {
    expect(headers).toMatch(
      /\/robots\.txt\n\s+Content-Type: text\/plain; charset=utf-8/,
    );
  });

  it("workers.dev 미리보기 주소는 색인하지 않는다", () => {
    // 주소는 <워커>.<서브도메인>.workers.dev — 라벨이 둘이라 자리표시자도 둘이어야
    // 한다. 하나만 적으면 실제 주소에 걸리지 않는다.
    expect(headers).toMatch(
      /^https:\/\/:worker\.:subdomain\.workers\.dev\/\*$\n\s+X-Robots-Tag: noindex$/m,
    );
    expect(headers).toMatch(
      /^https:\/\/:version\.:worker\.:subdomain\.workers\.dev\/\*$\n\s+X-Robots-Tag: noindex$/m,
    );
  });

  it("앱 연결 파일은 짧게 캐시된 JSON이다", () => {
    expect(headers).toMatch(
      /\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json/,
    );
    expect(headers).toMatch(
      /\/\.well-known\/assetlinks\.json\n\s+Content-Type: application\/json/,
    );
  });

  it("해시가 붙은 자산만 영구 캐시한다", () => {
    expect(headers).toMatch(
      /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/,
    );
    // HTML 문서는 영구 캐시하면 안 된다(배포해도 바뀌지 않는다).
    // `/assets/*`가 아니라 전역 `/*` 블록만 본다.
    expect(headers).not.toMatch(
      /^\/\*$\n(?:\s+.+\n)*?\s+Cache-Control: public, max-age=3153/m,
    );
  });
});
