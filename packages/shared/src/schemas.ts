import { z } from "zod";
import { isValidISODate } from "./dates";
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
  })
  .refine((v) => v.enlistedAt < v.dischargeAt, {
    message: "전역 예정일은 입대일보다 뒤여야 합니다",
    path: ["dischargeAt"],
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
  })
  .refine((v) => v.maxLeaveNumerator <= v.maxLeaveDenominator, {
    message: "출타율은 1(전원)을 넘을 수 없습니다",
    path: ["maxLeaveNumerator"],
  });

export const leaveCreateSchema = z
  .object({
    title: z.string().trim().min(1, "휴가 제목을 입력해주세요").max(80),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.startDate <= v.endDate, {
    message: "종료일은 시작일과 같거나 뒤여야 합니다",
    path: ["endDate"],
  });

export const leaveUpdateSchema = leaveCreateSchema;

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  enlistedAt: isoDateSchema.optional(),
  dischargeAt: isoDateSchema.optional(),
  rank: z.enum(RANKS).optional(),
});

export const pushTokenSchema = z.object({
  token: z.string().min(1).max(200),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
