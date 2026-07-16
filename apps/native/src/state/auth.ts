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
