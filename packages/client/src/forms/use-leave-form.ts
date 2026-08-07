/**
 * 휴가 등록/수정 폼의 "머리 없는(headless)" 상태 기계.
 *
 * 사용처: apps/web/src/components/LeaveFormModal.tsx,
 *        apps/native/src/components/leave-form-modal.tsx
 *
 * 두 앱은 입력 위젯(HTML input vs 네이티브 시트)만 다를 뿐,
 * "기간을 고르면 구간을 다시 맞추고 · 재원 잔여를 계산하고 · 주기 재원을 검사하고 ·
 * 더 여유로운 날짜를 추천한다"는 규칙은 완전히 같다. 그 규칙을 여기 한 벌만 둔다.
 *
 * 이 훅은 어떤 UI도 그리지 않는다. 화면은 반환값을 읽어 그리기만 하면 된다.
 */
import {
  addDays,
  balanceKeyToCategory,
  checkRegularOvernight,
  draftDaysByKey,
  draftsToSegments,
  fitDrafts,
  inclusiveDays,
  isRegularOvernightCycleBased,
  leaveCreateSchema,
  monthsSpanning,
  recommendDateRanges,
  regularOvernightAvailableIn,
  regularOvernightBlockMessage,
  resolveDrafts,
  segmentBalanceKey,
  segmentsToDrafts,
  BALANCE_KEYS,
  BALANCE_LABELS,
  type BalanceKey,
  type LeaveCreateInput,
  type LeaveStatus,
  type SegmentDraft,
  type SegmentLike,
} from "@leave/shared";
import { useMemo, useState } from "react";
import { useCalendarDays } from "../hooks/calendar";
import { useMe } from "../hooks/auth";
import {
  useCreateLeave,
  useLeaveBalances,
  useMyLeaves,
  useUpdateLeave,
} from "../hooks/leaves";
import type { LeaveResult, MyLeave } from "../types";

/** 대안 날짜를 찾을 때 선택 구간 앞뒤로 살펴보는 일수. */
export const RECOMMENDATION_RADIUS_DAYS = 14;

/** 혼잡도 문구의 경계값. 화면 두 곳이 같은 기준으로 말하도록 여기에 고정한다. */
const CROWD_TIGHT_PERCENT = 80;
const CROWD_MODERATE_PERCENT = 50;

export type CrowdLevel = "exceeded" | "tight" | "moderate" | "roomy";

/** 시뮬레이션 결과를 사용자에게 보여줄 한 단어로 바꾼다. */
export function crowdLevelLabel(level: CrowdLevel): string {
  return { exceeded: "초과", tight: "임박", moderate: "보통", roomy: "여유" }[
    level
  ];
}

export type LeaveFormOptions = {
  /** 달력에서 날짜를 눌러 열었을 때의 기본 날짜. */
  initialDate?: string;
  /** 수정 모드면 대상 휴가. 등록 모드면 null. */
  editing?: MyLeave | null;
  /**
   * 제목 입력란이 없는 화면(네이티브)에서 휴가 종류로 제목을 자동 생성한다.
   * 지정하면 `title` 상태 대신 이 함수의 결과를 저장한다.
   */
  deriveTitle?: (drafts: readonly SegmentDraft[]) => string;
};

/** 네이티브처럼 제목 입력을 두지 않는 화면이 쓰는 기본 제목 생성기. */
export function titleFromDrafts(drafts: readonly SegmentDraft[]): string {
  const first = drafts[0];
  return first ? `${BALANCE_LABELS[first.key]} 계획` : "휴가 계획";
}

export function useLeaveForm(options: LeaveFormOptions) {
  const editing = options.editing ?? null;
  const fallbackDate = options.initialDate ?? "";

  /* --- 서버 데이터 --------------------------------------------------- */
  const me = useMe();
  const balances = useLeaveBalances();
  const myLeaves = useMyLeaves();
  const create = useCreateLeave();
  const update = useUpdateLeave();

  /* --- 폼 상태 -------------------------------------------------------- */
  const [title, setTitle] = useState(editing?.title ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [startDate, setStartDate] = useState(
    editing?.startDate ?? fallbackDate,
  );
  const [endDate, setEndDate] = useState(editing?.endDate ?? fallbackDate);
  // 새 계획의 기본은 "희망"(그룹에 공개). 초안은 나만 보고 집계·명단에서 빠진다.
  const [status, setStatus] = useState<LeaveStatus>(
    editing?.status ?? "shared",
  );
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() =>
    editing?.segments.length
      ? segmentsToDrafts(editing.segments)
      : fitDrafts(
          [],
          editing?.startDate ?? fallbackDate,
          editing?.endDate ?? fallbackDate,
        ),
  );
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const duration = validRange ? inclusiveDays(startDate, endDate) : 0;

  /* --- 달력(혼잡도·추천의 근거) --------------------------------------- */
  // 추천은 선택 구간 밖 ±RECOMMENDATION_RADIUS_DAYS까지 살펴보므로, 그 범위가
  // 걸치는 달을 모두 받아야 월초·월말 후보가 빠지지 않는다.
  const calendarMonths = useMemo(() => {
    if (!startDate) return [];
    const end = endDate && endDate >= startDate ? endDate : startDate;
    return monthsSpanning(
      addDays(startDate, -RECOMMENDATION_RADIUS_DAYS),
      addDays(end, RECOMMENDATION_RADIUS_DAYS),
    );
  }, [startDate, endDate]);
  const calendar = useCalendarDays(me.data?.unit?.id ?? null, calendarMonths);

  /** 이 계획을 더했을 때 구간 안에서 가장 붐비는 날의 비율. */
  const selectedSimulation = useMemo(() => {
    if (!validRange || calendar.days.length === 0) return null;
    const stats = new Map(calendar.days.map((day) => [day.date, day]));
    let peak = 0;
    let exceeded = false;
    for (let index = 0; index < duration; index += 1) {
      const stat = stats.get(addDays(startDate, index));
      // 기준이 없는 날(allowed=0)이 하나라도 끼면 비율 자체가 뜻을 잃는다.
      if (!stat || stat.allowed <= 0) return null;
      // 수정 중이면 내 몫이 이미 통계에 들어 있으므로 더하지 않는다.
      const countAfter = stat.count + (editing ? 0 : 1);
      peak = Math.max(peak, Math.round((countAfter / stat.allowed) * 100));
      exceeded ||= countAfter > stat.allowed;
    }
    const level: CrowdLevel = exceeded
      ? "exceeded"
      : peak >= CROWD_TIGHT_PERCENT
        ? "tight"
        : peak >= CROWD_MODERATE_PERCENT
          ? "moderate"
          : "roomy";
    return { peak, exceeded, level, label: crowdLevelLabel(level) };
  }, [calendar.days, duration, editing, startDate, validRange]);

  /** 선택 구간이 제한 기간(검열·훈련)에 걸리면 저장 전에 알려야 한다. */
  const blackoutWarning = useMemo(() => {
    if (!validRange) return false;
    const blocked = new Set(
      calendar.days.filter((day) => day.blocked).map((day) => day.date),
    );
    for (let index = 0; index < duration; index += 1) {
      if (blocked.has(addDays(startDate, index))) return true;
    }
    return false;
  }, [calendar.days, duration, startDate, validRange]);

  /** 같은 길이로 옮길 수 있는, 더 여유로운 인접 날짜들. */
  const recommendations = useMemo(() => {
    if (!validRange || calendar.days.length === 0) return [];
    return recommendDateRanges({
      days: calendar.days.map((day) => ({
        date: day.date,
        count: day.count + (editing ? 0 : 1),
        allowed: day.allowed,
      })),
      selectedStart: startDate,
      durationDays: duration,
      radiusDays: RECOMMENDATION_RADIUS_DAYS,
    });
  }, [calendar.days, duration, editing, startDate, validRange]);

  /* --- 구간(어느 날짜에 어떤 재원을 쓰는가) ---------------------------- */
  /** 초안 구간에 실제 시작·종료일과 일수를 채워 넣은 것. 화면은 이걸 그린다. */
  const resolved = useMemo(
    () => (validRange ? resolveDrafts(startDate, drafts) : []),
    [validRange, startDate, drafts],
  );

  /** 기간이 바뀌면 구간을 다시 맞춰 항상 전체를 덮게 한다. */
  const applyRange = (nextStart: string, nextEnd: string) => {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDrafts((current) => fitDrafts(current, nextStart, nextEnd));
  };

  /* --- 재원 잔여 계산 -------------------------------------------------- */
  // 수정 중이면 이 휴가가 이미 쓰고 있던 몫을 되돌려줘야 자기 자신과 부딪히지 않는다.
  const remainingByKey = useMemo(() => {
    const result = new Map<BalanceKey, number>(
      (balances.data?.balances ?? []).map((item) => [
        item.key,
        item.remainingDays,
      ]),
    );
    for (const segment of editing?.segments ?? []) {
      const key = segmentBalanceKey(segment);
      result.set(key, (result.get(key) ?? 0) + segment.days);
    }
    return result;
  }, [balances.data, editing]);

  const regularConfig = balances.data?.regularOvernight ?? null;
  const cycleBased = isRegularOvernightCycleBased(regularConfig);
  const dischargeAt = me.data?.user.dischargeAt ?? "";

  // 이미 저장된 내 정기외박 구간. 수정 중이면 그 휴가 몫은 빼야 자기 자신과 부딪히지 않는다.
  const savedRegular = useMemo<SegmentLike[]>(
    () =>
      (myLeaves.data?.leaves ?? [])
        .filter((leave) => leave.id !== editing?.id)
        .flatMap((leave) => leave.segments),
    [myLeaves.data, editing],
  );

  // 폼이 이번에 정기외박으로 잡아둔 구간.
  const draftRegular = useMemo<SegmentLike[]>(
    () =>
      resolved
        .filter((draft) => draft.key === "regular_overnight")
        .map((draft) => ({
          ...balanceKeyToCategory(draft.key),
          startDate: draft.startDate,
          endDate: draft.endDate,
        })),
    [resolved],
  );

  // 주기 재원은 총합이 아니라 날짜가 속한 주기로 따진다.
  const regularBlock = useMemo(() => {
    if (!cycleBased || !dischargeAt || !draftRegular.length) return null;
    return checkRegularOvernight({
      config: regularConfig,
      existing: savedRegular,
      requested: draftRegular,
      dischargeAt,
    });
  }, [cycleBased, dischargeAt, regularConfig, savedRegular, draftRegular]);

  /** 폼에서 이미 배정한 몫까지 뺀 실제 남은 일수. */
  const availableByKey = useMemo(() => {
    const used = validRange
      ? draftDaysByKey(startDate, drafts)
      : new Map<BalanceKey, number>();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    // 주기 재원은 스칼라 잔여가 "이번 주기" 값이라 미래 주기를 잘못 막는다.
    // 구간 행마다 그 날짜의 주기로 따로 계산한다(아래 rowAvailable).
    if (cycleBased) result.delete("regular_overnight");
    return result;
  }, [remainingByKey, validRange, startDate, drafts, cycleBased]);

  /** 이 구간 날짜가 속한 주기까지 반영한, 행 하나짜리 잔여 표. */
  const rowAvailable = (from: string, to: string): Map<BalanceKey, number> => {
    if (!cycleBased) return availableByKey;
    return new Map(availableByKey).set(
      "regular_overnight",
      regularOvernightAvailableIn({
        config: regularConfig,
        used: [...savedRegular, ...draftRegular],
        dischargeAt,
        from,
        to,
      }),
    );
  };

  /* --- 저장 가능 여부 --------------------------------------------------- */
  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  /** 잔여 초과·주기 위반을 사람이 읽을 한 문장으로. 없으면 빈 문자열. */
  const balanceBlockMessage = [
    ...overused.map(
      ([key, remaining]) =>
        `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
    ),
    ...(regularBlock ? [regularOvernightBlockMessage(regularBlock)] : []),
  ].join(", ");

  const needsTitle = !options.deriveTitle;
  /** 저장을 막는 이유. null이면 저장할 수 있다. */
  const submitBlocker: string | null = !validRange
    ? "시작일과 종료일을 확인해주세요."
    : drafts.length === 0
      ? "휴가 종류를 선택해주세요."
      : needsTitle && title.trim().length === 0
        ? "휴가 제목을 입력해주세요."
        : balanceBlockMessage || null;
  const canSubmit = submitBlocker === null;

  /* --- 구간 나누기 도우미 ---------------------------------------------- */
  const lastDraft = resolved[resolved.length - 1];
  /**
   * "다른 종류를 이어 쓰기"를 눌렀을 때 새 구간에 넣을 재원.
   * 잔여가 하루라도 남은 다른 재원이 없으면 버튼 자체를 숨긴다.
   */
  const suggestedSplitKey =
    lastDraft && lastDraft.days > 1
      ? (() => {
          const available = rowAvailable(
            lastDraft.startDate,
            lastDraft.endDate,
          );
          return BALANCE_KEYS.find(
            (key) => key !== lastDraft.key && (available.get(key) ?? 0) >= 1,
          );
        })()
      : undefined;

  /* --- 저장 ------------------------------------------------------------ */
  /**
   * 서버에 저장한다. 성공하면 결과를, 검증 실패나 서버 오류면 null을 돌려주고
   * `error`에 사유를 담는다. 저장 후 화면 처리(닫기·알림)는 호출한 쪽 몫이다.
   */
  const submit = async (): Promise<LeaveResult | null> => {
    if (submitBlocker) {
      setError(submitBlocker);
      return null;
    }
    const input: LeaveCreateInput = {
      title: options.deriveTitle?.(drafts) ?? title.trim(),
      status,
      segments: draftsToSegments(startDate, drafts),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    const parsed = leaveCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return null;
    }
    setError(null);
    try {
      return editing
        ? await update.mutateAsync({ id: editing.id, input: parsed.data })
        : await create.mutateAsync(parsed.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
      return null;
    }
  };

  return {
    /** 수정 모드면 대상 휴가, 등록 모드면 null. 제목·버튼 문구를 가른다. */
    editing,
    title,
    setTitle,
    reason,
    setReason,
    status,
    setStatus,
    startDate,
    endDate,
    /** 시작·종료일을 함께 바꾼다. 구간이 자동으로 다시 맞춰진다. */
    applyRange,
    drafts,
    setDrafts,
    /** 화면에 그릴 구간 목록(실제 날짜·일수가 채워진 상태). */
    resolved,
    duration,
    validRange,
    selectedSimulation,
    blackoutWarning,
    recommendations,
    rowAvailable,
    suggestedSplitKey,
    balanceBlockMessage,
    submitBlocker,
    canSubmit,
    pending,
    error,
    setError,
    submit,
  };
}
