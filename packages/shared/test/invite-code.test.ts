import { describe, expect, it } from "vitest";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  inviteCodeFromUrl,
  inviteLink,
  isInviteCodeFormat,
  normalizeInviteCode,
} from "../src";

describe("초대코드 사전", () => {
  it("혼동 문자가 없는 32자다", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(32);
    // I·L·O·U가 없어야 정규화에서 되돌릴 수 있다.
    for (const letter of ["I", "L", "O", "U"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(letter);
    }
  });

  it("32는 256의 약수라 바이트를 그대로 접어도 편향이 없다", () => {
    expect(256 % INVITE_CODE_ALPHABET.length).toBe(0);
  });
});

describe("normalizeInviteCode", () => {
  it("소문자·공백·하이픈을 정규형으로 되돌린다", () => {
    expect(normalizeInviteCode(" a2-c4 d5 ")).toBe("A2C4D5");
    expect(normalizeInviteCode("a2c4d5")).toBe("A2C4D5");
  });

  it("혼동해서 친 글자를 사전 안의 글자로 되돌린다", () => {
    // O→0, I·L→1, U→V. 사전에 없는 글자들이라 되돌려도 충돌하지 않는다.
    expect(normalizeInviteCode("OIL23U")).toBe("011 23V".replace(" ", ""));
    expect(normalizeInviteCode("o i l 2 3 u")).toBe("01123V");
  });

  it("6자가 아니면 원문을 다듬기만 한다 — 옛 32자 코드가 그대로 지나가야 한다", () => {
    const legacy = "abcDEF-123_ghiJKL456mnoPQR789st";
    expect(normalizeInviteCode(` ${legacy} `)).toBe(legacy);
  });

  it("빈 값은 빈 값이다", () => {
    expect(normalizeInviteCode("")).toBe("");
    expect(normalizeInviteCode("   ")).toBe("");
  });
});

describe("isInviteCodeFormat", () => {
  it("사전 안의 글자 6개만 새 형식이다", () => {
    expect(isInviteCodeFormat("A2C4D5")).toBe(true);
    expect(isInviteCodeFormat("000000")).toBe(true);
  });

  it("길이가 다르거나 사전 밖 글자가 있으면 아니다", () => {
    expect(isInviteCodeFormat("A2C4D")).toBe(false);
    expect(isInviteCodeFormat("A2C4D56")).toBe(false);
    expect(isInviteCodeFormat("A2C4DI")).toBe(false); // I는 사전에 없다
    expect(isInviteCodeFormat("a2c4d5")).toBe(false); // 정규화 전 값은 아니다
    expect(isInviteCodeFormat("")).toBe(false);
  });
});

describe("inviteLink / inviteCodeFromUrl", () => {
  it("정본 주소를 만든다", () => {
    expect(inviteLink("A2C4D5")).toBe("https://leave.moveto.kr/invite/A2C4D5");
  });

  it("세 가지 링크 모양에서 코드를 꺼낸다", () => {
    expect(inviteCodeFromUrl("https://leave.moveto.kr/invite/A2C4D5")).toBe(
      "A2C4D5",
    );
    expect(inviteCodeFromUrl("leave://invite/A2C4D5")).toBe("A2C4D5");
    // Expo Go·개발 클라이언트는 /--/ 를 끼워 넣는다.
    expect(inviteCodeFromUrl("exp://192.168.0.2:8081/--/invite/A2C4D5")).toBe(
      "A2C4D5",
    );
  });

  it("쿼리와 프래그먼트가 붙어도 코드만 꺼낸다", () => {
    expect(
      inviteCodeFromUrl("https://leave.moveto.kr/invite/A2C4D5?from=kakao"),
    ).toBe("A2C4D5");
    expect(inviteCodeFromUrl("https://leave.moveto.kr/invite/A2C4D5#x")).toBe(
      "A2C4D5",
    );
  });

  it("소문자로 온 링크도 정규형으로 돌려준다", () => {
    expect(inviteCodeFromUrl("https://leave.moveto.kr/invite/a2c4d5")).toBe(
      "A2C4D5",
    );
  });

  it("퍼센트 인코딩을 푼 뒤에 검증한다 — %2F가 구분자를 되살린다", () => {
    expect(
      inviteCodeFromUrl("https://leave.moveto.kr/invite/A2C4D5%2Fevil"),
    ).toBe(null);
  });

  it("초대 경로가 아니거나 형식이 틀리면 null이다", () => {
    expect(inviteCodeFromUrl("https://leave.moveto.kr/u/hong")).toBe(null);
    expect(inviteCodeFromUrl("https://leave.moveto.kr/invite")).toBe(null);
    expect(inviteCodeFromUrl("https://leave.moveto.kr/invite/TOOLONG9")).toBe(
      null,
    );
    expect(inviteCodeFromUrl("")).toBe(null);
  });

  it("'invite'가 다른 낱말의 일부이면 잡지 않는다", () => {
    expect(inviteCodeFromUrl("https://leave.moveto.kr/xinvite/A2C4D5")).toBe(
      null,
    );
  });

  it("길이도 사전도 상수에서 온다", () => {
    expect(INVITE_CODE_LENGTH).toBe(6);
    const sample = INVITE_CODE_ALPHABET.slice(0, INVITE_CODE_LENGTH);
    expect(isInviteCodeFormat(sample)).toBe(true);
  });
});
