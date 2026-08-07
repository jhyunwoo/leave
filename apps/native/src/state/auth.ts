/**
 * 네이티브 세션 토큰 전역 상태.
 *
 * 웹과 달리 값이 세 가지다: `undefined`(SecureStore에서 불러오는 중),
 * `null`(비로그인), 문자열(로그인). "불러오는 중"을 구분하지 않으면 앱을 켤 때마다
 * 로그인 화면이 잠깐 스쳤다가 홈으로 넘어간다.
 */

import { atom } from "jotai";
import { persistToken } from "../api/client";

/** undefined = SecureStore에서 불러오는 중, null = 비로그인. */
export const tokenAtom = atom<string | null | undefined>(undefined);

/** 토큰 설정 + SecureStore 반영. */
export const setSessionAtom = atom(
  null,
  async (_get, set, token: string | null) => {
    await persistToken(token);
    set(tokenAtom, token);
  },
);
