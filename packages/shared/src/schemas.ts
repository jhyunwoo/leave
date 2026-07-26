import { z } from "zod";
import { isValidISODate } from "./dates";
import {
  allocationBalanceKey,
  BALANCE_KEYS,
  inclusiveDays,
  LEAVE_CATEGORIES,
  OVERNIGHT_KINDS,
} from "./leave";
import { BRANCHES, RANKS } from "./rank";

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, "YYYY-MM-DD 형식의 유효한 날짜여야 합니다");

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM 형식이어야 합니다");

export const signupSchema = z
  .object({
    email: z.email("올바른 이메일 주소를 입력해주세요"),
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다")
      .max(100, "비밀번호는 100자 이하여야 합니다"),
    name: z.string().trim().min(1, "이름을 입력해주세요").max(50),
    branch: z.enum(BRANCHES),
    enlistedAt: isoDateSchema,
    dischargeAt: isoDateSchema,
    rank: z.enum(RANKS),
    // 접속 기록·푸시 로그 등 개인정보 수집·이용 동의 (가입 필수)
    dataConsent: z.boolean(),
  })
  .refine((v) => v.enlistedAt < v.dischargeAt, {
    message: "전역 예정일은 입대일보다 뒤여야 합니다",
    path: ["dischargeAt"],
  })
  .refine((v) => v.dataConsent === true, {
    message: "개인정보 수집 및 이용에 동의해야 가입할 수 있습니다",
    path: ["dataConsent"],
  });

export const loginSchema = z.object({
  email: z.email("올바른 이메일 주소를 입력해주세요"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});

export const unitCreateSchema = z
  .object({
    name: z.string().trim().min(2, "부대 이름은 2자 이상이어야 합니다").max(80),
    description: z.string().trim().max(200).optional(),
    maxLeaveNumerator: z.int().min(1, "분자는 1 이상이어야 합니다"),
    maxLeaveDenominator: z.int().min(1, "분모는 1 이상이어야 합니다"),
    // 부대 인원(출타율 계산 기준). 미설정 시 앱 가입자 수로 대체한다.
    headcount: z
      .int()
      .min(1, "부대 인원은 1명 이상이어야 합니다")
      .max(100000)
      .optional(),
  })
  .refine((v) => v.maxLeaveNumerator <= v.maxLeaveDenominator, {
    message: "출타율은 1(전원)을 넘을 수 없습니다",
    path: ["maxLeaveNumerator"],
  });

/** 부대 정보 수정(관리자). 전 필드 선택적이되, 출타율은 같이 넘길 때만 검증. */
export const unitUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "부대 이름은 2자 이상이어야 합니다")
      .max(80)
      .optional(),
    description: z.string().trim().max(200).nullable().optional(),
    maxLeaveNumerator: z.int().min(1, "분자는 1 이상이어야 합니다").optional(),
    maxLeaveDenominator: z
      .int()
      .min(1, "분모는 1 이상이어야 합니다")
      .optional(),
    headcount: z
      .int()
      .min(1, "부대 인원은 1명 이상이어야 합니다")
      .max(100000)
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.maxLeaveNumerator === undefined ||
      v.maxLeaveDenominator === undefined ||
      v.maxLeaveNumerator <= v.maxLeaveDenominator,
    {
      message: "출타율은 1(전원)을 넘을 수 없습니다",
      path: ["maxLeaveNumerator"],
    },
  );

/** 관리자 이관 대상. */
export const unitTransferSchema = z.object({
  userId: z.string().min(1, "대상을 선택해주세요"),
});

export const leaveAllocationSchema = z
  .object({
    category: z.enum(LEAVE_CATEGORIES),
    days: z.int().min(1, "휴가 일수는 1일 이상이어야 합니다").max(365),
    overnightKind: z.enum(OVERNIGHT_KINDS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.category === "overnight" && !value.overnightKind) {
      ctx.addIssue({
        code: "custom",
        path: ["overnightKind"],
        message: "외박 종류를 선택해주세요",
      });
    }
    if (value.category !== "overnight" && value.overnightKind) {
      ctx.addIssue({
        code: "custom",
        path: ["overnightKind"],
        message: "외박에만 외박 종류를 지정할 수 있습니다",
      });
    }
  });

export const leaveCreateSchema = z
  .object({
    title: z.string().trim().min(1, "휴가 제목을 입력해주세요").max(80),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().max(500).optional(),
    allocations: z
      .array(leaveAllocationSchema)
      .min(1, "휴가 재원을 하나 이상 선택해주세요")
      .max(10),
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "종료일은 시작일과 같거나 뒤여야 합니다",
      });
      return;
    }
    const keys = value.allocations.map(allocationBalanceKey);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "같은 휴가 재원은 한 번만 입력할 수 있습니다",
      });
    }
    const allocated = value.allocations.reduce(
      (sum, item) => sum + item.days,
      0,
    );
    const duration = inclusiveDays(value.startDate, value.endDate);
    if (allocated !== duration) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: `휴가 기간 ${duration}일과 재원 합계 ${allocated}일이 일치해야 합니다`,
      });
    }
  });

export const leaveUpdateSchema = leaveCreateSchema;

export const leaveBalanceUpdateSchema = z.object({
  totals: z.record(z.enum(BALANCE_KEYS), z.int().min(0).max(999)),
});

export const regularOvernightConfigSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    nextGrantDate: isoDateSchema,
    intervalDays: z.int().min(1).max(365),
    daysPerGrant: z.int().min(1).max(30),
  }),
]);

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  enlistedAt: isoDateSchema.optional(),
  dischargeAt: isoDateSchema.optional(),
  rank: z.enum(RANKS).optional(),
});

export const pushTokenSchema = z.object({
  token: z.string().min(1).max(200),
});

/**
 * 앱이 자가 보고하는 푸시 이벤트 — 이 앱이 보낸 알림의 수신(receipt)·열람(open)만 대상으로 한다.
 * 기기의 다른 앱 알림은 다루지 않는다.
 */
export const pushEventSchema = z.object({
  direction: z.enum(["receipt", "open"]),
  notificationId: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(500).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type PushEventInput = z.infer<typeof pushEventSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;
export type UnitTransferInput = z.infer<typeof unitTransferSchema>;
export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
export type LeaveAllocationInput = z.infer<typeof leaveAllocationSchema>;
export type LeaveBalanceUpdateInput = z.infer<typeof leaveBalanceUpdateSchema>;
export type RegularOvernightConfigInput = z.infer<
  typeof regularOvernightConfigSchema
>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
