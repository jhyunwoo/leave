import { describe, expect, it } from "vitest";
import {
  leaveCreateSchema,
  pushEventSchema,
  signupSchema,
  unitCreateSchema,
} from "../src";

const baseSignup = {
  email: "soldier@test.com",
  password: "password123",
  name: "홍길동",
  branch: "army" as const,
  enlistedAt: "2026-01-05",
  dischargeAt: "2027-07-04",
  rank: "private" as const,
  dataConsent: true,
};

describe("signupSchema", () => {
  it("동의(dataConsent=true) 시 통과", () => {
    expect(signupSchema.safeParse(baseSignup).success).toBe(true);
  });
  it("동의하지 않으면 실패", () => {
    const res = signupSchema.safeParse({ ...baseSignup, dataConsent: false });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /동의/.test(i.message))).toBe(true);
    }
  });
  it("전역일이 입대일보다 앞서면 실패", () => {
    const res = signupSchema.safeParse({
      ...baseSignup,
      enlistedAt: "2027-01-05",
      dischargeAt: "2026-01-05",
    });
    expect(res.success).toBe(false);
  });
});

describe("pushEventSchema", () => {
  it("receipt/open만 허용", () => {
    expect(pushEventSchema.safeParse({ direction: "receipt" }).success).toBe(true);
    expect(pushEventSchema.safeParse({ direction: "open" }).success).toBe(true);
    expect(pushEventSchema.safeParse({ direction: "send" }).success).toBe(false);
  });
});

describe("leaveCreateSchema", () => {
  it("종료일이 시작일보다 앞서면 실패", () => {
    expect(
      leaveCreateSchema.safeParse({
        title: "휴가",
        startDate: "2026-08-10",
        endDate: "2026-08-01",
      }).success,
    ).toBe(false);
  });
});

describe("unitCreateSchema", () => {
  it("출타율은 1(전원)을 넘을 수 없다", () => {
    expect(
      unitCreateSchema.safeParse({
        name: "테스트대대",
        maxLeaveNumerator: 4,
        maxLeaveDenominator: 3,
      }).success,
    ).toBe(false);
  });
});
