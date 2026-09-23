/**
 * 모든 API 입력의 zod 스키마 — 서버 검증과 클라이언트 검증의 단일 출처.
 *
 * 사용처:
 *  - 서버: @hono/zod-openapi가 이 스키마로 요청을 검증하고 /docs 문서를 만든다.
 *  - 앱/웹: 같은 스키마로 저장 직전에 미리 검증해, 서버까지 갔다가 400을 받는
 *    왕복을 줄인다.
 *
 * 여기서 파생되는 `...Input` 타입이 곧 클라이언트 뮤테이션의 인자 타입이다.
 * 스키마를 고치면 서버·문서·앱 타입이 한꺼번에 따라 움직인다.
 */

import { z } from "zod";
import { addDays, diffDays, isValidISODate } from "./dates";
import { isAcceptableInviteCode, normalizeInviteCode } from "./invite-code";
import {
  BALANCE_KEYS,
  LEAVE_CATEGORIES,
  LEAVE_STATUSES,
  MAX_LEAVE_SEGMENTS,
  OUTING_KINDS,
  OVERNIGHT_KINDS,
  sortSegments,
  USER_EDITABLE_LEAVE_STATUSES,
} from "./leave";
import { BRANCHES, RANKS } from "./rank";
import {
  MAX_FRIEND_CALENDAR_SELECTION,
  normalizeEmail,
  normalizeFriendIds,
} from "./friends";
import {
  isCanonicalUsername,
  isUsernameQuery,
  normalizeUsername,
  normalizeUsernameQuery,
  usernameProblem,
} from "./username";

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, "YYYY-MM-DD 형식의 유효한 날짜여야 합니다");

/**
 * 날짜 구간 하나가 덮을 수 있는 최대 일수(시작일·종료일 포함).
 *
 * 상한이 없으면 `0100-01-01~9999-12-31`(361만 일)짜리 구간이 그대로 통과한다.
 * 서버는 휴가를 저장한 뒤 그 기간을 하루씩 펼쳐 출타 인원을 세므로
 * (apps/api/src/lib/overage.ts → computeDayStats), 요청 하나가 워커 격리 환경의
 * 메모리 상한을 수십 배로 넘겨 죽는다 — 하루당 약 580바이트니 361만 일이면 2GB다.
 * 복무 기간을 통째로 덮는 일정도 1년을 넘지 않으므로 윤년을 포함한 366일로 자른다.
 */
export const MAX_DATE_RANGE_DAYS = 366;

/** 시작·종료를 모두 포함한 구간 길이가 상한을 넘는지. */
function rangeTooLong(start: string, end: string): boolean {
  return diffDays(start, end) + 1 > MAX_DATE_RANGE_DAYS;
}

/** 상한을 넘는 구간이면 종료일 자리에 오류를 남긴다. */
function refineRangeLength(
  start: string,
  end: string,
  ctx: z.RefinementCtx,
  path: PropertyKey[] = ["endDate"],
) {
  if (rangeTooLong(start, end)) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `기간은 최대 ${MAX_DATE_RANGE_DAYS}일까지 지정할 수 있습니다`,
    });
  }
}

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM 형식이어야 합니다");

export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm 형식의 유효한 시간이어야 합니다");

export const normalizedEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.email("올바른 이메일 주소를 입력해주세요"));

export const signupSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다")
      .max(100, "비밀번호는 100자 이하여야 합니다"),
    // 신규 클라이언트는 계정부터 만든 뒤 온보딩에서 복무정보를 저장한다.
    // optional은 구버전 클라이언트의 한 번에 가입 계약을 유지하기 위한 것이다.
    name: z.string().trim().min(1, "이름을 입력해주세요").max(50).optional(),
    branch: z.enum(BRANCHES).optional(),
    enlistedAt: isoDateSchema.optional(),
    dischargeAt: isoDateSchema.optional(),
    rank: z.enum(RANKS).optional(),
    // 접속 기록·푸시 로그 등 개인정보 수집·이용 동의 (가입 필수)
    dataConsent: z.boolean(),
  })
  .refine(
    (v) => !v.enlistedAt || !v.dischargeAt || v.enlistedAt < v.dischargeAt,
    {
      message: "전역 예정일은 입대일보다 뒤여야 합니다",
      path: ["dischargeAt"],
    },
  )
  .refine(
    (v) => {
      const supplied = [v.name, v.branch, v.enlistedAt, v.dischargeAt, v.rank];
      return (
        supplied.every((value) => value === undefined) ||
        supplied.every((value) => value !== undefined)
      );
    },
    { message: "복무정보는 모두 입력하거나 온보딩에서 설정해주세요" },
  )
  .refine((v) => v.dataConsent === true, {
    message: "개인정보 수집 및 이용에 동의해야 가입할 수 있습니다",
    path: ["dataConsent"],
  });

/**
 * 확인용 비밀번호 입력의 길이 상한.
 *
 * 비밀번호를 **정하는** 자리는 전부 100자로 막혀 있으므로(가입·변경·관리자 생성)
 * 이 값을 넘는 문자열은 어떤 계정의 비밀번호도 될 수 없다. 그런데도 상한이 없으면
 * 그 문자열이 그대로 PBKDF2로 들어간다 — 맞을 리 없는 입력에 서버가 일을 한다.
 * 여유를 두고 200으로 잡아 정상 비밀번호는 절대 걸리지 않게 한다.
 */
const MAX_SUBMITTED_PASSWORD_LENGTH = 200;

export const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: z
    .string()
    .min(1, "비밀번호를 입력해주세요")
    .max(MAX_SUBMITTED_PASSWORD_LENGTH, "비밀번호가 너무 깁니다"),
});

/** 패스키 관리·ceremony 입력. 브라우저/네이티브 WebAuthn 응답은 불투명 JSON이다. */
export const passkeyRegistrationOptionsSchema = z.object({
  name: z.string().trim().min(1, "패스키 이름을 입력해주세요").max(50),
  currentPassword: z
    .string()
    .min(1, "현재 비밀번호를 입력해주세요")
    .max(MAX_SUBMITTED_PASSWORD_LENGTH, "비밀번호가 너무 깁니다"),
});

export const passkeyVerificationSchema = z.object({
  ceremonyId: z.uuid(),
  response: z.record(z.string(), z.unknown()),
});

export const passkeyDeleteSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "현재 비밀번호를 입력해주세요")
    .max(MAX_SUBMITTED_PASSWORD_LENGTH, "비밀번호가 너무 깁니다"),
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
  outingCounts: z.boolean().optional(),
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
  outingCounts: z.boolean().optional(),
  lastTotalUpdatedAt: inviteExpiresAtSchema.nullable().optional(),
});

/**
 * 초대코드는 검색 가능한 그룹 식별자 대신 사용하는 비밀값이다.
 *
 * 사용자가 친 값을 먼저 정규형으로 접는다 — 대소문자·공백·하이픈과 사람이 흔히
 * 헷갈리는 글자(O/0, I·L/1, U/V)를 여기서 흡수해야, 받아 적은 코드가 한 글자
 * 때문에 거절되지 않는다. 규칙은 `invite-code.ts` 한 곳에 있다.
 *
 * 아직 만료되지 않은 옛 32자 코드도 받는다.
 */
export const unitJoinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "초대코드를 입력해주세요")
    .max(200)
    .transform(normalizeInviteCode)
    .refine(isAcceptableInviteCode, "올바른 초대코드를 입력해주세요"),
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

/**
 * 외출 갈래의 짝 맞춤. 외박(`overnightKindRefine`)과 달리 **갈래가 없어도 통과시킨다** —
 * 갈래가 생기기 전 버전의 앱이 보내는 외출 구간이 있고, 그때는 평일로 읽는다
 * (`segmentBalanceKey`). 반대 방향(외출이 아닌데 갈래가 붙는 것)만 막는다.
 */
const outingKindRefine = (
  value: { category: string; outingKind?: string },
  ctx: z.RefinementCtx,
) => {
  if (value.category !== "outing" && value.outingKind) {
    ctx.addIssue({
      code: "custom",
      path: ["outingKind"],
      message: "외출에만 외출 종류를 지정할 수 있습니다",
    });
  }
};

/** 휴가 한 구간: "8/2~8/5는 연가". 일수는 날짜에서 파생되므로 입력받지 않는다. */
export const leaveSegmentSchema = z
  .object({
    category: z.enum(LEAVE_CATEGORIES),
    overnightKind: z.enum(OVERNIGHT_KINDS).optional(),
    outingKind: z.enum(OUTING_KINDS).optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    regularOvernightCycleStart: isoDateSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    overnightKindRefine(value, ctx);
    outingKindRefine(value, ctx);
    if (
      value.regularOvernightCycleStart &&
      !(value.category === "overnight" && value.overnightKind === "regular")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["regularOvernightCycleStart"],
        message: "정기외박에만 차감 주기를 지정할 수 있습니다",
      });
    }
    // 외출은 당일 복귀다 — 부대관리훈령의 외출은 그날 과업 개시부터 저녁점호 전까지이고,
    // 밤을 넘기는 순간 그것은 외박이다(48시간, 공휴일 포함 시 72시간). 이 규칙이 있어야
    // 외출 구간이 주기를 걸치지 않고, 주기별 셈에 "어느 주기에서 뺄지"를 물을 일이 없다.
    if (value.category === "outing" && value.startDate !== value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "외출은 당일 복귀라 하루로만 등록할 수 있습니다",
      });
      return;
    }
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "구간 종료일은 시작일과 같거나 뒤여야 합니다",
      });
      return;
    }
    refineRangeLength(value.startDate, value.endDate, ctx);
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
    // 구버전 클라이언트가 생략하면 서버가 21:00으로 저장한다.
    returnTime: localTimeSchema.optional(),
    segments: z
      .array(leaveSegmentSchema)
      .min(1, "휴가 구간을 하나 이상 입력해주세요")
      .max(MAX_LEAVE_SEGMENTS),
  })
  .superRefine((value, ctx) => {
    const sorted = sortSegments(value.segments);
    // 구간이 빈틈없이 이어지므로 구간별 상한만으로는 전체 기간이 30배까지 늘어난다.
    // 출타 집계가 펼치는 것은 휴가 전체 기간이니 여기서 한 번 더 막는다.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first && last && first.startDate <= last.endDate) {
      refineRangeLength(first.startDate, last.endDate, ctx, ["segments"]);
    }
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
    // 외출은 그 자체로 한 건이다 — 연가가 끝나면 복귀하고, 다음 날 나가는 외출은
    // 이어진 하나의 출타가 아니라 별개의 사건이다. 한 휴가에 섞으면 부대 출타 집계가
    // 마지막 날을 복귀일로 보고 빼 버린다(leave-merge.ts의 hasOuting 주석).
    if (
      sorted.length > 1 &&
      sorted.some((segment) => segment.category === "outing")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["segments"],
        message: "외출은 다른 휴가와 이어 붙일 수 없습니다",
      });
    }
  });

export const leaveUpdateSchema = leaveCreateSchema;

/** 목록의 빠른 변경은 사용자가 직접 선택할 수 있는 상태 한 필드만 받는다. */
export const leaveStatusUpdateSchema = z.object({
  status: z.enum(USER_EDITABLE_LEAVE_STATUSES),
});

export type LeaveStatusUpdateInput = z.infer<typeof leaveStatusUpdateSchema>;

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

/**
 * 주기 재원(정기외박·외출)의 자동 적립 설정에 공통으로 들어가는 칸.
 *
 * 두 재원이 같은 문장 구조를 갖는다 — "언제부터, 얼마마다, 회당 몇". 계산도
 * 같은 엔진(leave-cycle.ts)이 하므로 입력 범위도 한 벌만 둔다. 따로 적으면
 * 한쪽만 고쳐졌을 때 서버가 받아 준 값을 다른 화면이 못 그리는 상태가 된다.
 */
const cycleConfigFields = {
  // 주기 시작일 — 1주기가 시작하는 날. 첫 적립은 한 주기 뒤에 이뤄진다.
  startDate: isoDateSchema,
  intervalDays: z.int().min(1).max(365).nullish(),
  intervalMonths: z.int().min(1).max(12).nullish(),
  daysPerGrant: z.int().min(1).max(30),
  // 주기가 끝나도 남길지. 구버전 앱은 보내지 않으므로 optional이고, 그때는 꺼진다.
  carryOver: z.boolean().optional(),
} as const;

/**
 * 주기는 일 또는 개월 중 **하나로만** 정한다. 둘 다 오면 어느 쪽이 이기는지가
 * 저장 계층과 계산 계층의 약속이 되어 버리므로, 애초에 들어오지 못하게 막는다.
 * 달 단위가 필요한 이유는 leave-cycle.ts 머리말에 있다.
 */
const cycleIntervalRefine = (
  value: { intervalDays?: number | null; intervalMonths?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (Boolean(value.intervalDays) === Boolean(value.intervalMonths)) {
    ctx.addIssue({
      code: "custom",
      path: ["intervalDays"],
      message: "주기는 일 또는 개월 중 하나로만 정할 수 있습니다",
    });
  }
};

/** 정기외박 자동 적립 설정. */
export const regularOvernightConfigSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z
    .object({ enabled: z.literal(true), ...cycleConfigFields })
    .superRefine(cycleIntervalRefine),
]);

/**
 * 외출 자동 적립 설정 — 갈래(평일·주말) 하나 몫.
 *
 * 갈래마다 따로 저장하므로 요청도 한 번에 하나다. 두 갈래를 한 요청에 묶으면
 * 한쪽만 고치려는 화면이 나머지 한쪽의 현재 값을 정확히 되보내야 하고, 그 왕복이
 * 어긋나는 순간 건드리지도 않은 갈래가 꺼진다.
 *
 * `daysPerGrant`는 외출에서 **횟수**다 — 외출은 당일 복귀라 한 번이 하루다.
 */
export const outingConfigSchema = z.discriminatedUnion("enabled", [
  z.object({ kind: z.enum(OUTING_KINDS), enabled: z.literal(false) }),
  z
    .object({
      kind: z.enum(OUTING_KINDS),
      enabled: z.literal(true),
      ...cycleConfigFields,
    })
    .superRefine(cycleIntervalRefine),
]);

/**
 * 내 정보 수정. 보낸 항목만 바꾸는 부분 수정이라 전부 optional이다.
 *
 * 입대일·전역예정일의 선후 관계는 여기서 검사하지 않는다. 한쪽만 보낼 수 있어서
 * 두 값이 다 있어야 성립하는 규칙을 스키마 단계에서 강제할 수 없다. 서버가
 * 기존 행과 합친 뒤에 검사한다(apps/api/src/routes/auth.ts).
 */
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "별칭을 입력해주세요").max(50).optional(),
  branch: z.enum(BRANCHES).optional(),
  enlistedAt: isoDateSchema.optional(),
  dischargeAt: isoDateSchema.optional(),
  rank: z.enum(RANKS).optional(),
});

/** 온보딩 1단계는 부분 수정이 아니라 완성된 복무 프로필 한 벌을 저장한다. */
export const onboardingProfileSchema = z
  .object({
    name: z.string().trim().min(1, "별칭을 입력해주세요").max(50),
    branch: z.enum(BRANCHES),
    enlistedAt: isoDateSchema,
    dischargeAt: isoDateSchema,
    rank: z.enum(RANKS),
  })
  .refine((value) => value.enlistedAt < value.dischargeAt, {
    path: ["dischargeAt"],
    message: "전역 예정일은 입대일보다 뒤여야 합니다",
  });

/**
 * 비밀번호 변경. 현재 비밀번호를 함께 받아 세션 탈취만으로는 바꾸지 못하게 한다.
 * 성공하면 서버가 기존 세션을 모두 끊고 새 토큰을 발급한다.
 */
export const passwordChangeSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "현재 비밀번호를 입력해주세요")
    .max(MAX_SUBMITTED_PASSWORD_LENGTH, "비밀번호가 너무 깁니다"),
  newPassword: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다")
    .max(100, "비밀번호는 100자 이하여야 합니다"),
});

/** 검열·훈련 등 출타율과 무관하게 휴가가 제한될 수 있는 기간(관리자 등록). */
export const blackoutCreateSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().max(200).optional(),
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
    refineRangeLength(value.startDate, value.endDate, ctx);
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

/**
 * 공개 사용자 이름 — 저장·조회에 쓰는 정규형으로 바꾼 뒤 규칙을 본다.
 *
 * `transform`이 먼저 도는 덕분에 서버·앱·딥링크가 전부 같은 값을 보게 되고,
 * 실패 메시지는 `usernameProblem`이 한 벌로 만든다(화면이 문구를 새로 짓지 않는다).
 */
export const usernameSchema = z
  .string()
  .max(200, "사용자 이름이 너무 깁니다")
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    if (isCanonicalUsername(value)) return;
    ctx.addIssue({
      code: "custom",
      message: usernameProblem(value) ?? "사용할 수 없는 사용자 이름이에요",
    });
  });

/** 사용자 이름 설정·변경 본문. */
export const usernameSetSchema = z.object({ username: usernameSchema });

/**
 * 사용자 검색어. 앞에 붙은 `@`를 떼고 정규화한다.
 * 접두어 단계라 마침표 위치·예약어는 보지 않는다(username.ts의 `isUsernameQuery`).
 */
export const usernameQuerySchema = z
  .string()
  .max(200, "검색어가 너무 깁니다")
  .transform(normalizeUsernameQuery)
  .refine(
    isUsernameQuery,
    "영문·한글·숫자와 마침표(.), 밑줄(_)로 검색해주세요",
  );

/**
 * 친구 요청 대상.
 *
 * 이메일이 아니라 공개 사용자 이름으로 받는다. 이메일로 요청을 보낼 수 있으면
 * "이 주소로 가입했는가"를 요청 결과로 떠볼 수 있어, 친구 찾기가 곧 이메일 열거
 * 수단이 된다. 사용자 이름은 애초에 공개하려고 만든 식별자다.
 */
export const friendRequestCreateSchema = z.object({
  username: usernameSchema,
});

export const friendIdsSchema = z
  .array(z.string().trim().min(1).max(100))
  .transform(normalizeFriendIds)
  .refine((ids) => ids.length >= 1, "친구를 한 명 이상 선택해주세요")
  .refine(
    (ids) => ids.length <= MAX_FRIEND_CALENDAR_SELECTION,
    `친구는 최대 ${MAX_FRIEND_CALENDAR_SELECTION}명까지 선택할 수 있습니다`,
  );

function validateEventRange(
  value: {
    startDate?: string;
    endDate?: string;
    startTime?: string | null;
    endTime?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (value.startDate && value.endDate) {
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "종료일은 시작일과 같거나 뒤여야 합니다",
      });
      return;
    }
    refineRangeLength(value.startDate, value.endDate, ctx);
  }
  if (
    value.startDate === value.endDate &&
    value.startTime &&
    value.endTime &&
    value.startTime > value.endTime
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "종료 시간은 시작 시간과 같거나 뒤여야 합니다",
    });
  }
}

export const personalEventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "일정 제목을 입력해주세요").max(80),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    startTime: localTimeSchema.nullable().optional(),
    endTime: localTimeSchema.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine(validateEventRange);

export const personalEventUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "일정 제목을 입력해주세요")
    .max(80)
    .optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  startTime: localTimeSchema.nullable().optional(),
  endTime: localTimeSchema.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * 부대원 모두에게 공개되는 일정. 휴가·개인 일정과 별도 엔티티라 출타 집계나
 * 잔여량에는 영향을 주지 않는다. isHoliday는 달력에서 공휴일과 같은 빨간색
 * 표시를 적용할지 정하는 관리자의 명시적 분류다.
 */
export const unitEventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "부대 일정명을 입력해주세요").max(80),
    isHoliday: z.boolean(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    startTime: localTimeSchema.nullable().optional(),
    endTime: localTimeSchema.nullable().optional(),
    details: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine(validateEventRange);

export const unitEventUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "부대 일정명을 입력해주세요")
    .max(80)
    .optional(),
  isHoliday: z.boolean().optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  startTime: localTimeSchema.nullable().optional(),
  endTime: localTimeSchema.nullable().optional(),
  details: z.string().trim().max(1000).nullable().optional(),
});

/** 알림 종류별 수신 설정. 보낸 항목만 바꾼다. */
export const notificationPrefsSchema = z.object({
  overage: z.boolean().optional(),
  blackout: z.boolean().optional(),
  unitNotice: z.boolean().optional(),
  friendRequest: z.boolean().optional(),
  friendLeave: z.boolean().optional(),
});

/** 친구에게 보여줄 항목. 모든 친구에게 같게 적용되고, 보낸 항목만 바꾼다. */
export const friendSharingSchema = z.object({
  /** 복무율 — 친구에게 입대일·전역일이 간다. */
  serviceProgress: z.boolean().optional(),
  dutyDays: z.boolean().optional(),
  /** 휴가 일정(외출 포함). 끄면 친구에게 가는 새 휴가 알림도 멈춘다. */
  leaveSchedule: z.boolean().optional(),
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
export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;
export type PushEventInput = z.infer<typeof pushEventSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasskeyRegistrationOptionsInput = z.infer<
  typeof passkeyRegistrationOptionsSchema
>;
export type PasskeyVerificationInput = z.infer<
  typeof passkeyVerificationSchema
>;
export type PasskeyDeleteInput = z.infer<typeof passkeyDeleteSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;
export type UnitJoinInput = z.infer<typeof unitJoinSchema>;
export type UnitInviteCreateInput = z.infer<typeof unitInviteCreateSchema>;
export type UnitTransferInput = z.infer<typeof unitTransferSchema>;
export type BlackoutCreateInput = z.infer<typeof blackoutCreateSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type BlockCreateInput = z.infer<typeof blockCreateSchema>;
export type FriendRequestCreateInput = z.infer<
  typeof friendRequestCreateSchema
>;
export type UsernameSetInput = z.infer<typeof usernameSetSchema>;
export type PersonalEventCreateInput = z.infer<
  typeof personalEventCreateSchema
>;
export type PersonalEventUpdateInput = z.infer<
  typeof personalEventUpdateSchema
>;
export type UnitEventCreateInput = z.infer<typeof unitEventCreateSchema>;
export type UnitEventUpdateInput = z.infer<typeof unitEventUpdateSchema>;
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
export type FriendSharingInput = z.infer<typeof friendSharingSchema>;
export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
export type LeaveBalanceUpdateInput = z.infer<typeof leaveBalanceUpdateSchema>;
export type LeaveGrantCreateInput = z.infer<typeof leaveGrantCreateSchema>;
export type LeaveGrantUpdateInput = z.infer<typeof leaveGrantUpdateSchema>;
export type OutingConfigInput = z.infer<typeof outingConfigSchema>;
export type RegularOvernightConfigInput = z.infer<
  typeof regularOvernightConfigSchema
>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

/** 메일에서 받은 일회용 코드. 선행 0도 보존한다. */
export const emailVerificationSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/, "6자리 인증 코드를 입력해주세요"),
});
