import { z } from "zod";
import { addDays, isValidISODate } from "./dates";
import {
  BALANCE_KEYS,
  LEAVE_CATEGORIES,
  LEAVE_STATUSES,
  OVERNIGHT_KINDS,
  sortSegments,
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

/** 하루 최대 출타 인원. 부대 관리자가 직접 지정한다. */
const maxLeaveCountSchema = z
  .int("최대 출타 인원을 입력해주세요")
  .min(0, "최대 출타 인원은 0명 이상이어야 합니다")
  .max(100000, "최대 출타 인원이 너무 큽니다");

/** 실제 편제·정원이 아닌, 관리자가 계산 기준으로 정한 임의의 인원 값. */
const referenceMemberTotalSchema = z
  .int("기준 인원을 입력해주세요")
  .min(1, "기준 인원은 1명 이상이어야 합니다")
  .max(100000, "기준 인원이 너무 큽니다");

const unitDisplayNameSchema = z
  .string()
  .trim()
  .min(2, "그룹 이름은 2자 이상이어야 합니다")
  .max(80)
  .describe(
    "검색되지 않는 그룹 내부 표시명입니다. 실제 부대명·부대번호·주소·위치 등 식별 정보를 입력하면 안 됩니다.",
  );

const unitDescriptionSchema = z
  .string()
  .trim()
  .max(200)
  .describe(
    "실제 부대명·부대번호·주소·위치, 병력 현황, 작전·훈련 정보를 입력하면 안 됩니다.",
  );

const inviteExpiresAtSchema = z.iso.datetime({ offset: true });
const inviteMaxUsesSchema = z
  .int("초대코드 사용 가능 횟수를 입력해주세요")
  .min(1, "초대코드는 한 번 이상 사용할 수 있어야 합니다")
  .max(10000, "초대코드 사용 가능 횟수가 너무 큽니다");

export const unitCreateSchema = z.object({
  name: unitDisplayNameSchema,
  description: unitDescriptionSchema.optional(),
  referenceMemberTotal: referenceMemberTotalSchema.nullable().optional(),
  maxLeaveCount: maxLeaveCountSchema,
  returnDayCounts: z.boolean().optional(),
  lastTotalUpdatedAt: inviteExpiresAtSchema.nullable().optional(),
  inviteExpiresAt: inviteExpiresAtSchema.optional(),
  inviteMaxUses: inviteMaxUsesSchema.optional(),
});

/** 부대 정보 수정(관리자). 전 필드 선택적. */
export const unitUpdateSchema = z.object({
  name: unitDisplayNameSchema.optional(),
  description: unitDescriptionSchema.nullable().optional(),
  referenceMemberTotal: referenceMemberTotalSchema.nullable().optional(),
  maxLeaveCount: maxLeaveCountSchema.optional(),
  returnDayCounts: z.boolean().optional(),
  lastTotalUpdatedAt: inviteExpiresAtSchema.nullable().optional(),
});

/** 초대코드는 검색 가능한 그룹 식별자 대신 사용하는 고엔트로피 비밀값이다. */
export const unitJoinSchema = z.object({
  code: z.string().trim().min(32, "올바른 초대코드를 입력해주세요").max(200),
});

/** 관리자가 현재 코드를 폐기하고 새 코드를 발급할 때 지정하는 제한. */
export const unitInviteCreateSchema = z.object({
  expiresAt: inviteExpiresAtSchema.optional(),
  maxUses: inviteMaxUsesSchema.optional(),
});

/** 관리자 이관 대상. */
export const unitTransferSchema = z.object({
  userId: z.string().min(1, "대상을 선택해주세요"),
});

const overnightKindRefine = (
  value: { category: string; overnightKind?: string },
  ctx: z.RefinementCtx,
) => {
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
};

/** 휴가 한 구간: "8/2~8/5는 연가". 일수는 날짜에서 파생되므로 입력받지 않는다. */
export const leaveSegmentSchema = z
  .object({
    category: z.enum(LEAVE_CATEGORIES),
    overnightKind: z.enum(OVERNIGHT_KINDS).optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .superRefine((value, ctx) => {
    overnightKindRefine(value, ctx);
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "구간 종료일은 시작일과 같거나 뒤여야 합니다",
      });
    }
  });

export type LeaveSegmentInput = z.infer<typeof leaveSegmentSchema>;

/**
 * 휴가 등록/수정 본문.
 *
 * 구간들은 서로 겹치지 않으면서 휴가 기간을 빈틈없이 이어 덮어야 한다.
 * 휴가의 전체 기간은 구간에서 파생하므로 따로 입력받지 않는다.
 */
export const leaveCreateSchema = z
  .object({
    title: z.string().trim().min(1, "휴가 제목을 입력해주세요").max(80),
    reason: z.string().trim().max(500).optional(),
    // 생략하면 기존 동작대로 "희망"(집계 반영)으로 저장한다.
    status: z.enum(LEAVE_STATUSES).optional(),
    segments: z
      .array(leaveSegmentSchema)
      .min(1, "휴가 구간을 하나 이상 입력해주세요")
      .max(30),
  })
  .superRefine((value, ctx) => {
    const sorted = sortSegments(value.segments);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (current.startDate <= previous.endDate) {
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "휴가 구간끼리 겹칠 수 없습니다",
        });
        return;
      }
      if (current.startDate !== addDays(previous.endDate, 1)) {
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "휴가 구간 사이에 빈 날이 있을 수 없습니다",
        });
        return;
      }
    }
  });

export const leaveUpdateSchema = leaveCreateSchema;

export const leaveBalanceUpdateSchema = z.object({
  totals: z.record(z.enum(BALANCE_KEYS), z.int().min(0).max(999)),
});

/** 부여일보다 앞선 만기는 성립하지 않는다. */
function grantDateOrder(
  value: { grantedOn?: string | null; expiresOn?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.grantedOn && value.expiresOn && value.grantedOn > value.expiresOn) {
    ctx.addIssue({
      code: "custom",
      path: ["expiresOn"],
      message: "만기 기한은 부여일과 같거나 뒤여야 합니다",
    });
  }
}

export const leaveGrantCreateSchema = z
  .object({
    balanceKey: z.enum(BALANCE_KEYS),
    days: z.int().min(1, "1일 이상이어야 합니다").max(999),
    grantedOn: isoDateSchema.nullable().optional(),
    expiresOn: isoDateSchema.nullable().optional(),
    note: z.string().trim().max(100).nullable().optional(),
  })
  .superRefine(grantDateOrder);

/**
 * 적립분 수정. balanceKey는 바꿀 수 없다 — 재원을 옮기면 두 재원의 사용분 귀속이
 * 조용히 뒤집힌다. 재원을 바꾸려면 지우고 새로 만든다.
 */
export const leaveGrantUpdateSchema = z
  .object({
    days: z.int().min(1, "1일 이상이어야 합니다").max(999).optional(),
    grantedOn: isoDateSchema.nullable().optional(),
    expiresOn: isoDateSchema.nullable().optional(),
    note: z.string().trim().max(100).nullable().optional(),
  })
  .superRefine(grantDateOrder);

export const regularOvernightConfigSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    // 주기 시작일 — 1주기가 시작하는 날. 첫 적립은 한 주기 뒤에 이뤄진다.
    startDate: isoDateSchema,
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

/** 검열·훈련 등 출타율과 무관하게 휴가가 제한될 수 있는 기간(관리자 등록). */
export const blackoutCreateSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "종료일은 시작일과 같거나 뒤여야 합니다",
  });

export const REPORT_REASONS = [
  "military_info",
  "personal_info",
  "abuse",
  "spam",
  "other",
] as const;

export const REPORT_REASON_LABELS: Record<
  (typeof REPORT_REASONS)[number],
  string
> = {
  military_info: "부대·병력·작전 정보 입력",
  personal_info: "실명·군번·계급 등 개인정보",
  abuse: "욕설·괴롭힘",
  spam: "스팸·광고",
  other: "기타",
};

export const reportCreateSchema = z.object({
  targetType: z.enum(["unit", "member"]),
  targetId: z.string().min(1).max(100),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(500).optional(),
});

export const blockCreateSchema = z.object({
  userId: z.string().min(1).max(100),
});

/** 알림 종류별 수신 설정. 보낸 항목만 바꾼다. */
export const notificationPrefsSchema = z.object({
  overage: z.boolean().optional(),
  blackout: z.boolean().optional(),
  unitNotice: z.boolean().optional(),
});

export const leaveStatusSchema = z.enum(LEAVE_STATUSES);

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
});

export type SignupInput = z.infer<typeof signupSchema>;
export type PushEventInput = z.infer<typeof pushEventSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;
export type UnitJoinInput = z.infer<typeof unitJoinSchema>;
export type UnitInviteCreateInput = z.infer<typeof unitInviteCreateSchema>;
export type UnitTransferInput = z.infer<typeof unitTransferSchema>;
export type BlackoutCreateInput = z.infer<typeof blackoutCreateSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type BlockCreateInput = z.infer<typeof blockCreateSchema>;
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
export type LeaveBalanceUpdateInput = z.infer<typeof leaveBalanceUpdateSchema>;
export type LeaveGrantCreateInput = z.infer<typeof leaveGrantCreateSchema>;
export type LeaveGrantUpdateInput = z.infer<typeof leaveGrantUpdateSchema>;
export type RegularOvernightConfigInput = z.infer<
  typeof regularOvernightConfigSchema
>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
