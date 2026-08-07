/**
 * 웹 세션 토큰 전역 상태.
 *
 * 사용처: App.tsx의 인증 분기, api/provider.tsx의 로그인·로그아웃 반영.
 * 토큰 원문은 api/client.ts가 localStorage와 함께 들고 있고, 이 atom은
 * "바뀌면 화면을 다시 그리게 하는" 역할만 한다.
 */

import { atom } from "jotai";
import { getAuthToken, setAuthToken } from "../api/client";

const baseTokenAtom = atom<string | null>(getAuthToken());

/** 세션 토큰. 쓰면 localStorage에도 반영된다. */
export const tokenAtom = atom(
  (get) => get(baseTokenAtom),
  (_get, set, token: string | null) => {
    setAuthToken(token);
    set(baseTokenAtom, token);
  },
);

export const isAuthedAtom = atom((get) => get(tokenAtom) !== null);
