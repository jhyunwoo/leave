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
    expect(pushEventSchema.safeParse({ direction: "receipt" }).success).toBe(
      true,
    );
    expect(pushEventSchema.safeParse({ direction: "open" }).success).toBe(true);
    expect(pushEventSchema.safeParse({ direction: "send" }).success).toBe(
      false,
    );
  });
});

describe("leaveCreateSchema", () => {
  it("구간이 빈틈없이 이어지면 통과", () => {
    expect(
      leaveCreateSchema.safeParse({
        title: "가족여행",
        segments: [
          {
            category: "annual",
            startDate: "2026-08-01",
            endDate: "2026-08-03",
          },
          {
            category: "overnight",
            overnightKind: "regular",
            startDate: "2026-08-04",
            endDate: "2026-08-05",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("구간 종료일이 시작일보다 앞서면 실패", () => {
    expect(
      leaveCreateSchema.safeParse({
        title: "휴가",
        segments: [
          {
            category: "annual",
            startDate: "2026-08-10",
            endDate: "2026-08-01",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("구간이 없거나 외박 종류가 없으면 실패", () => {
    expect(
      leaveCreateSchema.safeParse({ title: "구간 없음", segments: [] }).success,
    ).toBe(false);
    expect(
      leaveCreateSchema.safeParse({
        title: "외박 종류 오류",
        segments: [
          {
            category: "overnight",
            startDate: "2026-08-01",
            endDate: "2026-08-01",
          },
        ],
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

  it("직접 지정 최대 출타 인원은 0명 이상이어야 한다", () => {
    const base = {
      name: "테스트대대",
      maxLeaveNumerator: 1,
      maxLeaveDenominator: 3,
    };
    expect(
      unitCreateSchema.safeParse({ ...base, maxLeaveCount: 0 }).success,
    ).toBe(true);
    expect(
      unitCreateSchema.safeParse({ ...base, maxLeaveCount: -1 }).success,
    ).toBe(false);
  });
});
