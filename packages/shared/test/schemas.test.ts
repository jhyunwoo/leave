import { describe, expect, it } from "vitest";
import {
  addDays,
  blackoutCreateSchema,
  leaveCreateSchema,
  leaveGrantCreateSchema,
  leaveGrantUpdateSchema,
  loginSchema,
  MAX_DATE_RANGE_DAYS,
  passwordChangeSchema,
  personalEventCreateSchema,
  regularOvernightConfigSchema,
  pushEventSchema,
  signupSchema,
  unitCreateSchema,
  unitEventCreateSchema,
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

describe("unitEventCreateSchema", () => {
  const base = {
    title: "부대 행사",
    isHoliday: false,
    startDate: "2026-09-01",
    endDate: "2026-09-02",
  };

  it("평일·휴일 구분과 선택 시간·상세 정보를 받는다", () => {
    expect(
      unitEventCreateSchema.safeParse({
        ...base,
        isHoliday: true,
        startTime: "09:00",
        endTime: "18:00",
        details: "부대원 공지",
      }).success,
    ).toBe(true);
  });

  it("역전된 날짜와 같은 날 역전된 시간을 거부한다", () => {
    expect(
      unitEventCreateSchema.safeParse({
        ...base,
        startDate: "2026-09-03",
      }).success,
    ).toBe(false);
    expect(
      unitEventCreateSchema.safeParse({
        ...base,
        endDate: "2026-09-01",
        startTime: "18:00",
        endTime: "09:00",
      }).success,
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

/*
 * 날짜 구간의 상한.
 *
 * 서버는 휴가를 저장한 뒤 그 기간을 하루씩 펼쳐 출타 인원을 센다
 * (apps/api/src/lib/overage.ts → computeDayStats, 하루당 약 580바이트).
 * 상한이 없던 동안에는 `0100-01-01~9999-12-31`(361만 일)짜리 구간이 그대로
 * 통과해, 요청 하나로 워커가 수 GB를 잡으려다 죽었다. 경계값을 함께 고정한다.
 */
const RANGE_START = "2026-01-01";
/** 시작일을 포함해 정확히 상한만큼인 종료일. */
const RANGE_END_AT_LIMIT = addDays(RANGE_START, MAX_DATE_RANGE_DAYS - 1);
const RANGE_END_OVER_LIMIT = addDays(RANGE_START, MAX_DATE_RANGE_DAYS);
const ABSURD_END = "9999-12-31";

function leaveOf(startDate: string, endDate: string) {
  return {
    title: "긴 휴가",
    segments: [{ category: "annual" as const, startDate, endDate }],
  };
}

describe("날짜 구간 상한", () => {
  it("휴가 구간은 상한까지 허용하고 하루라도 넘으면 거절한다", () => {
    expect(
      leaveCreateSchema.safeParse(leaveOf(RANGE_START, RANGE_END_AT_LIMIT))
        .success,
    ).toBe(true);
    const over = leaveCreateSchema.safeParse(
      leaveOf(RANGE_START, RANGE_END_OVER_LIMIT),
    );
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.message).toMatch(
      new RegExp(`최대 ${MAX_DATE_RANGE_DAYS}일`),
    );
  });

  it("복무 기간을 통째로 덮는 휴가는 거절한다", () => {
    expect(
      leaveCreateSchema.safeParse(leaveOf("0100-01-01", ABSURD_END)).success,
    ).toBe(false);
  });

  it("구간을 잘게 쪼개 이어 붙여도 전체 기간이 상한을 넘으면 거절한다", () => {
    // 구간 하나하나는 상한 안이지만 빈틈없이 이어져 합계가 상한을 넘는 모양.
    // 전체 기간을 따로 보지 않으면 30배까지 늘어난다.
    const segments = [];
    let cursor = RANGE_START;
    for (let i = 0; i < 4; i += 1) {
      const end = addDays(cursor, 99);
      segments.push({
        category: "annual" as const,
        startDate: cursor,
        endDate: end,
      });
      cursor = addDays(end, 1);
    }
    const parsed = leaveCreateSchema.safeParse({
      title: "쪼갠 휴가",
      segments,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(
      new RegExp(`최대 ${MAX_DATE_RANGE_DAYS}일`),
    );
  });

  it("금휴 기간·개인 일정·부대 일정도 같은 상한을 따른다", () => {
    const atLimit = { startDate: RANGE_START, endDate: RANGE_END_AT_LIMIT };
    const overLimit = { startDate: RANGE_START, endDate: RANGE_END_OVER_LIMIT };
    expect(blackoutCreateSchema.safeParse(atLimit).success).toBe(true);
    expect(blackoutCreateSchema.safeParse(overLimit).success).toBe(false);
    expect(
      personalEventCreateSchema.safeParse({ title: "일정", ...atLimit })
        .success,
    ).toBe(true);
    expect(
      personalEventCreateSchema.safeParse({ title: "일정", ...overLimit })
        .success,
    ).toBe(false);
    expect(
      unitEventCreateSchema.safeParse({
        title: "일정",
        isHoliday: false,
        ...atLimit,
      }).success,
    ).toBe(true);
    expect(
      unitEventCreateSchema.safeParse({
        title: "일정",
        isHoliday: false,
        ...overLimit,
      }).success,
    ).toBe(false);
  });

  it("순서가 뒤집힌 구간은 상한과 무관하게 거절한다", () => {
    expect(
      blackoutCreateSchema.safeParse({
        startDate: "2026-01-02",
        endDate: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      leaveCreateSchema.safeParse(leaveOf("2026-01-02", "2026-01-01")).success,
    ).toBe(false);
  });
});

/*
 * 로그인에 실려 오는 비밀번호의 상한.
 *
 * 검증은 PBKDF2 100,000회로 이뤄진다. 길이 제한이 없으면 아무나, 인증 없이,
 * 요청 하나에 임의 길이의 입력을 그 해시 함수에 밀어 넣을 수 있다.
 */
describe("비밀번호 길이 상한", () => {
  const huge = "a".repeat(5000);

  it("로그인은 지나치게 긴 비밀번호를 해시 전에 거절한다", () => {
    expect(
      loginSchema.safeParse({
        email: "soldier@test.com",
        password: "password123",
      }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: "soldier@test.com", password: huge })
        .success,
    ).toBe(false);
  });

  it("비밀번호 변경도 현재 비밀번호 길이를 제한한다", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: huge,
        newPassword: "password123",
      }).success,
    ).toBe(false);
  });
});

describe("정기외박 자동 적립 설정", () => {
  const base = {
    enabled: true as const,
    startDate: "2026-03-01",
    daysPerGrant: 2,
  };

  it("주기는 일 또는 개월 중 하나로만 받는다", () => {
    expect(
      regularOvernightConfigSchema.safeParse({ ...base, intervalDays: 42 })
        .success,
    ).toBe(true);
    expect(
      regularOvernightConfigSchema.safeParse({ ...base, intervalMonths: 3 })
        .success,
    ).toBe(true);
    // 둘 다 오면 어느 쪽이 이기는지가 암묵적 약속이 되므로 막는다.
    expect(
      regularOvernightConfigSchema.safeParse({
        ...base,
        intervalDays: 42,
        intervalMonths: 3,
      }).success,
    ).toBe(false);
    expect(regularOvernightConfigSchema.safeParse(base).success).toBe(false);
  });

  it("단위마다 허용 범위가 다르다", () => {
    expect(
      regularOvernightConfigSchema.safeParse({ ...base, intervalMonths: 12 })
        .success,
    ).toBe(true);
    expect(
      regularOvernightConfigSchema.safeParse({ ...base, intervalMonths: 13 })
        .success,
    ).toBe(false);
    expect(
      regularOvernightConfigSchema.safeParse({ ...base, intervalDays: 366 })
        .success,
    ).toBe(false);
  });

  it("꺼진 설정은 주기를 요구하지 않는다", () => {
    expect(
      regularOvernightConfigSchema.safeParse({ enabled: false }).success,
    ).toBe(true);
  });
});
