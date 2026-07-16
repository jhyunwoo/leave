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
