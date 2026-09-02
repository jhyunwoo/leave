/**
 * 클라이언트 라우팅 뒤 문서 메타데이터를 맞춘다.
 *
 * 라우터 안에 한 번만 마운트한다(App.tsx). 화면마다 `document.title = ...`을
 * 흩뿌리지 않기 위한 자리이고, 문구의 출처는 언제나 `seo/routes.ts`다.
 *
 * 크롤러가 보는 첫 응답의 메타는 미리 그린 HTML과 워커 헤더가 정한다. 이
 * 컴포넌트는 그 위에 덮어쓰지 않는다 — 특히 색인 대상 페이지의 robots를
 * 스크립트로 noindex로 바꾸지 않는다. 구글은 noindex를 만나면 렌더링 자체를
 * 건너뛸 수 있어서, "일단 noindex로 두고 스크립트로 되돌린다"는 순서는
 * 성립하지 않는다.
 */

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { isAuthedAtom } from "../state/auth";
import { INDEXABLE_ROBOTS } from "./head";
import {
  AUTHED_HOME_TITLE,
  classifyPath,
  normalizePath,
  TITLE_SUFFIX,
} from "./routes";
import { absoluteUrl } from "./site";

function upsertMeta(name: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.name = name;
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

export function RouteMetadata() {
  const location = useLocation();
  const isAuthed = useAtomValue(isAuthedAtom);

  useEffect(() => {
    const path = normalizePath(location.pathname);
    const classification = classifyPath(path);
    // 법적 고지 페이지는 SPA가 아니라 별도 문서다. 여기에 올 일이 없고,
    // 오더라도 그 문서가 스스로 가진 메타를 건드리지 않는다.
    if (classification.kind === "static") return;

    // canonical에 질의 문자열을 싣지 않는다. `?next=`는 같은 문서의 사본을
    // 만들 뿐이다.
    upsertCanonical(absoluteUrl(path));

    if (classification.kind === "prerendered") {
      // 로그인 사용자의 `/`는 달력이지만 이 주소의 정본은 여전히 공개 랜딩이다.
      // 제목만 화면에 맞추고 robots는 색인 가능 상태로 둔다.
      document.title =
        path === "/" && isAuthed
          ? `${AUTHED_HOME_TITLE}${TITLE_SUFFIX}`
          : classification.page.title;
      upsertMeta("robots", INDEXABLE_ROBOTS);
      return;
    }

    const title =
      classification.kind === "spa"
        ? classification.route.title
        : "페이지를 찾을 수 없어요";
    document.title = `${title}${TITLE_SUFFIX}`;
    upsertMeta("robots", "noindex, follow");
  }, [location.pathname, isAuthed]);

  return null;
}
