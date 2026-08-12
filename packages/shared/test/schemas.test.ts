import { describe, expect, it } from "vitest";
import {
  leaveCreateSchema,
  leaveGrantCreateSchema,
  leaveGrantUpdateSchema,
  pushEventSchema,
  signupSchema,
  unitCreateSchema,
  unitInviteCreateSchema,
  unitJoinSchema,
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
  it("복무정보 없이 계정만 먼저 만들 수 있다", () => {
    expect(
      signupSchema.safeParse({
        email: "account@test.com",
        password: "password123",
        dataConsent: true,
      }).success,
    ).toBe(true);
  });
  it("복무정보 일부만 보내면 실패한다", () => {
    expect(
      signupSchema.safeParse({
        email: "partial@test.com",
        password: "password123",
        name: "라임고래",
        dataConsent: true,
      }).success,
    ).toBe(false);
  });
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
  it("최대 출타 인원은 필수다", () => {
    expect(unitCreateSchema.safeParse({ name: "테스트대대" }).success).toBe(
      false,
    );
  });

  it("최대 출타 인원은 0명 이상의 정수여야 한다", () => {
    const base = { name: "테스트대대" };
    expect(
      unitCreateSchema.safeParse({ ...base, maxLeaveCount: 0 }).success,
    ).toBe(true);
    expect(
      unitCreateSchema.safeParse({ ...base, maxLeaveCount: -1 }).success,
    ).toBe(false);
    expect(
      unitCreateSchema.safeParse({ ...base, maxLeaveCount: 1.5 }).success,
    ).toBe(false);
  });

  it("기준 인원·갱신 시각·초대 제한을 검증한다", () => {
    const valid = {
      name: "비식별 모임",
      referenceMemberTotal: 60,
      maxLeaveCount: 12,
      lastTotalUpdatedAt: "2026-08-04T12:00:00.000Z",
      inviteExpiresAt: "2026-08-11T12:00:00.000Z",
      inviteMaxUses: 50,
    };
    expect(unitCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      unitCreateSchema.safeParse({ ...valid, referenceMemberTotal: 0 }).success,
    ).toBe(false);
    expect(
      unitCreateSchema.safeParse({ ...valid, inviteMaxUses: 0 }).success,
    ).toBe(false);
  });
});

describe("unitJoinSchema / unitInviteCreateSchema", () => {
  it("짧은 추측 가능 코드는 거부한다", () => {
    expect(unitJoinSchema.safeParse({ code: "123456" }).success).toBe(false);
    expect(unitJoinSchema.safeParse({ code: "A".repeat(32) }).success).toBe(
      true,
    );
  });

  it("재발급 제한은 양의 사용 횟수와 ISO 시각만 받는다", () => {
    expect(
      unitInviteCreateSchema.safeParse({
        maxUses: 10,
        expiresAt: "2026-08-11T12:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(unitInviteCreateSchema.safeParse({ maxUses: 0 }).success).toBe(
      false,
    );
    expect(
      unitInviteCreateSchema.safeParse({ expiresAt: "2026-08-11" }).success,
    ).toBe(false);
  });
});

describe("적립분 스키마", () => {
  it("일수는 1 이상이어야 한다", () => {
    const base = { balanceKey: "award" as const };
    expect(leaveGrantCreateSchema.safeParse({ ...base, days: 1 }).success).toBe(
      true,
    );
    expect(leaveGrantCreateSchema.safeParse({ ...base, days: 0 }).success).toBe(
      false,
    );
  });

  it("만기는 선택이며 null도 받는다", () => {
    expect(
      leaveGrantCreateSchema.safeParse({
        balanceKey: "award",
        days: 3,
        expiresOn: null,
      }).success,
    ).toBe(true);
    expect(
      leaveGrantCreateSchema.safeParse({ balanceKey: "award", days: 3 })
        .success,
    ).toBe(true);
  });

  it("만기가 부여일보다 앞서면 거절한다", () => {
    const parsed = leaveGrantCreateSchema.safeParse({
      balanceKey: "award",
      days: 3,
      grantedOn: "2026-09-01",
      expiresOn: "2026-08-31",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/부여일과 같거나 뒤/);
  });

  it("잘못된 날짜 형식은 거절한다", () => {
    expect(
      leaveGrantCreateSchema.safeParse({
        balanceKey: "award",
        days: 3,
        expiresOn: "2026-13-01",
      }).success,
    ).toBe(false);
  });

  it("수정 스키마는 재원을 바꿀 수 없다", () => {
    const parsed = leaveGrantUpdateSchema.parse({
      days: 2,
      balanceKey: "annual",
    });
    expect(parsed).not.toHaveProperty("balanceKey");
  });
});
