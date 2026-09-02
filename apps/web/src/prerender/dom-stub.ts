/**
 * 빌드 시 HTML을 미리 그릴 때만 쓰는 최소 브라우저 전역 대체물.
 *
 * `api/client.ts`가 모듈을 읽는 순간 `localStorage`에서 토큰을 꺼낸다. Node에는
 * 그 전역이 없어 import만으로 죽는다. 앱 코드에 `typeof window` 분기를 뿌리는
 * 대신, 미리 그리는 쪽에서만 빈 저장소를 끼워 넣는다 — 브라우저 번들에는 이
 * 파일이 들어가지 않는다.
 *
 * 값은 언제나 비어 있다. 미리 그리는 화면은 정의상 "로그인하지 않은 방문자가
 * 보는 것"이고, 그래야 브라우저에서 그대로 hydrate된다.
 */

if (typeof globalThis.localStorage === "undefined") {
  const empty: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {},
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: empty,
    configurable: true,
  });
}
