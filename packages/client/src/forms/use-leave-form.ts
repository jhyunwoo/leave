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
  appendDraft,
  balanceKeyToCategory,
  checkOuting,
  checkRegularOvernight,
  draftDaysByKey,
  draftsEndDate,
  draftsToSegments,
  eligibleRegularOvernightCycles,
  fitDraftsToTotal,
  inclusiveDays,
  isOutingBalanceKey,
  isOutingCycleBased,
  isRegularOvernightCycleBased,
  leaveCreateSchema,
  OUTING_KINDS,
  outingAvailableIn,
  outingBalanceKey,
  outingBlockMessage,
  monthsSpanning,
  recommendDateRanges,
  regularOvernightAvailableIn,
  regularOvernightBlockMessage,
  removeDraft,
  reorderDrafts,
  resolveDrafts,
  segmentBalanceKey,
  segmentsToDrafts,
  setDraftDays,
  totalDraftDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  MAX_DATE_RANGE_DAYS,
  MAX_LEAVE_SEGMENTS,
  type BalanceKey,
  type LeaveCreateInput,
  type LeaveStatus,
  type OutingConfig,
  type OutingKind,
  type SegmentDraft,
  type SegmentLike,
} from "@leave/shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { balanceCountedSegments } from "../balance-segments";
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
   * 사용자가 제목을 직접 적지 않는 화면(네이티브 등록, 아직 이름을 안 고친 수정)에서
   * 휴가 종류로 제목을 자동 생성한다. 지정하면 `title` 상태 대신 이 함수의 결과를
   * 저장한다.
   */
  deriveTitle?: (drafts: readonly SegmentDraft[]) => string;
};

// 제목 규칙은 서버도 쓰므로 @leave/shared에 산다. 기존 import 경로를 깨지 않도록 재수출한다.
export { isDerivedTitle, titleFromDrafts } from "@leave/shared";

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
  const [returnTime, setReturnTime] = useState(editing?.returnTime ?? "21:00");
  const [startDate, setStartDate] = useState(
    editing?.startDate ?? fallbackDate,
  );
  // 새 계획의 기본은 "희망"(그룹에 공개). 초안은 나만 보고 집계·명단에서 빠진다.
  const [status, setStatus] = useState<LeaveStatus>(
    editing?.status ?? "shared",
  );
  // 종료일은 상태가 아니라 개수의 합에서 나온다. 상태를 둘로 두면 어긋날 수 있고,
  // 실제로 "기간을 바꾸면 구간을 다시 맞춘다"는 보정이 그것 때문에 필요했다.
  const [drafts, setDraftState] = useState<SegmentDraft[]>(() =>
    editing?.segments.length
      ? segmentsToDrafts(editing.segments)
      : [{ key: "annual", days: 1 }],
  );
  const [error, setError] = useState<string | null>(null);
  // 잔여 조회는 폼보다 늦게 끝날 수 있고, 취소 직후에는 이전 캐시가 먼저 보일 수도 있다.
  // 사용자가 직접 종류를 고르기 전까지는 최신 잔여로 기본값을 계속 바로잡는다.
  const balanceSelectionTouched = useRef(Boolean(editing));

  /** 화면에서 구간을 직접 바꾸는 순간부터는 사용자의 선택을 우선한다. */
  const setDrafts = (next: SetStateAction<SegmentDraft[]>) => {
    balanceSelectionTouched.current = true;
    setDraftState(next);
  };

  const pending = create.isPending || update.isPending;
  const duration = totalDraftDays(drafts);
  // 시작일만 고르면 나머지는 전부 파생된다 — 종료일이 시작일보다 앞설 수 없다.
  const validRange = Boolean(startDate) && duration > 0;
  const endDate = validRange ? draftsEndDate(startDate, drafts) : "";

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

  /**
   * 이 계획이 그룹 출타율에 더하는 인원. 보통 1명이지만 둘일 때 0이다.
   *  - 수정 중: 내 몫이 이미 서버 통계에 들어 있다.
   *  - 외출만으로 이뤄진 계획인데 그룹이 외출을 세지 않는다: 저장해도 숫자가 그대로다.
   *    외출은 다른 재원과 한 휴가에 섞일 수 없으므로(`leaveCreateSchema`) 전부인지만 본다.
   * 여기서 한 번 정해 아래 두 곳이 같은 가정을 쓰게 한다 — 갈리면 미리보기와 추천이
   * 서로 다른 숫자를 말한다.
   */
  const selfCount = useMemo(() => {
    if (editing) return 0;
    if (
      me.data?.unit?.outingCounts === false &&
      drafts.every((draft) => isOutingBalanceKey(draft.key))
    ) {
      return 0;
    }
    return 1;
  }, [drafts, editing, me.data?.unit?.outingCounts]);

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
      const countAfter = stat.count + selfCount;
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
  }, [calendar.days, duration, selfCount, startDate, validRange]);

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
        count: day.count + selfCount,
        allowed: day.allowed,
      })),
      selectedStart: startDate,
      durationDays: duration,
      radiusDays: RECOMMENDATION_RADIUS_DAYS,
    });
  }, [calendar.days, duration, selfCount, startDate, validRange]);

  /* --- 구간(어느 날짜에 어떤 재원을 쓰는가) ---------------------------- */
  /** 초안 구간에 실제 시작·종료일과 일수를 채워 넣은 것. 화면은 이걸 그린다. */
  const resolved = useMemo(
    () => (validRange ? resolveDrafts(startDate, drafts) : []),
    [validRange, startDate, drafts],
  );

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

  /** 갈래별 외출 설정. 응답이 아직 없거나 구버전이면 빈 표. */
  const outingConfigs = useMemo(() => {
    const rows = balances.data?.outing ?? [];
    const map = new Map<OutingKind, OutingConfig>();
    for (const row of rows) map.set(row.kind, row);
    return map;
  }, [balances.data]);

  const regularCycleChoices = useMemo(
    () =>
      resolved.map((draft) =>
        draft.key === "regular_overnight"
          ? eligibleRegularOvernightCycles(
              regularConfig,
              draft.startDate,
              draft.endDate,
              dischargeAt,
            )
          : [],
      ),
    [resolved, regularConfig, dischargeAt],
  );

  useEffect(() => {
    if (!cycleBased) return;
    setDraftState((current) => {
      let changed = false;
      const next = current.map((draft, index) => {
        if (draft.key !== "regular_overnight") return draft;
        const choices = regularCycleChoices[index] ?? [];
        const valid = choices.some(
          (cycle) => cycle.start === draft.regularOvernightCycleStart,
        );
        const selected = valid
          ? draft.regularOvernightCycleStart
          : choices.length === 1
            ? choices[0]!.start
            : null;
        if (selected === (draft.regularOvernightCycleStart ?? null)) {
          return draft;
        }
        changed = true;
        return { ...draft, regularOvernightCycleStart: selected };
      });
      return changed ? next : current;
    });
  }, [cycleBased, regularCycleChoices]);

  // 이미 저장된 내 구간 전부. 수정 중이면 그 휴가 몫은 빼야 자기 자신과 부딪히지 않는다.
  // 정기외박과 외출 판정이 함께 쓴다 — 각자 자기 재원만 골라 센다.
  // 기준은 서버의 잔여 계산과 같아야 한다(balance-segments.ts 주석 참고) — 예전에는
  // 여기서 초안을 빼고 서버는 세어서, 칩은 여유가 있는데 저장은 400인 조합이 났다.
  const savedSegments = useMemo<SegmentLike[]>(
    () =>
      balanceCountedSegments(myLeaves.data?.leaves, {
        excludeLeaveId: editing?.id,
      }),
    [myLeaves.data, editing],
  );

  /**
   * 등록 날짜에 실제로 가장 많이 남은 재원. 자동 정기외박은 현재 주기 요약 대신
   * 선택 날짜가 속한 주기의 잔여를 비교한다. 동률이면 API 순서를 따른다.
   */
  const preferredBalanceKey = useMemo<BalanceKey | undefined>(() => {
    let preferred: { key: BalanceKey; remaining: number } | undefined;
    for (const item of balances.data?.balances ?? []) {
      // 외출은 기본값이 되지 않는다. 잔여가 가장 많다는 이유로 자동 선택되면 폼이
      // 말없이 "하루·단독" 모드가 되고, 사용자는 왜 종류를 더할 수 없는지 모른다.
      // 외출은 고르는 것이지 기본으로 놓이는 것이 아니다.
      if (isOutingBalanceKey(item.key)) continue;
      const remaining =
        item.key === "regular_overnight" &&
        cycleBased &&
        validRange &&
        dischargeAt
          ? regularOvernightAvailableIn({
              config: regularConfig,
              used: savedSegments,
              dischargeAt,
              from: startDate,
              to: endDate,
            })
          : item.remainingAsOfTodayDays;
      if (!preferred || remaining > preferred.remaining) {
        preferred = { key: item.key, remaining };
      }
    }
    return preferred?.key;
  }, [
    balances.data?.balances,
    cycleBased,
    dischargeAt,
    endDate,
    regularConfig,
    savedSegments,
    startDate,
    validRange,
  ]);

  useEffect(() => {
    if (balanceSelectionTouched.current || !preferredBalanceKey) return;
    setDraftState((current) =>
      current.map((draft, index) =>
        index === 0 ? { ...draft, key: preferredBalanceKey } : draft,
      ),
    );
  }, [preferredBalanceKey]);

  /**
   * 달력에서 기간을 직접 고르면 총 일수를 그 길이에 맞춘다.
   * 개수 ↔ 달력은 양방향이라야 "8/9까지"와 "8개"가 같은 말이 된다.
   */
  const applyRange = (nextStart: string, nextEnd: string) => {
    setStartDate(nextStart);
    if (!nextStart || !nextEnd || nextEnd < nextStart) return;
    setDraftState((current) =>
      fitDraftsToTotal(
        current,
        inclusiveDays(nextStart, nextEnd),
        preferredBalanceKey,
      ),
    );
  };

  /** 시작일만 옮긴다. 종류와 개수는 그대로 따라간다(추천 날짜가 쓴다). */
  const moveToStart = (nextStart: string) => setStartDate(nextStart);

  /* --- 구간 편집 (화면은 이 넷만 부른다) ------------------------------- */
  const setDraftDaysAt = (index: number, days: number) =>
    setDrafts((current) => setDraftDays(current, index, days));

  const addDraft = (key: BalanceKey) =>
    setDrafts((current) =>
      current.length >= MAX_LEAVE_SEGMENTS
        ? current
        : appendDraft(current, key),
    );

  const removeDraftAt = (index: number) =>
    setDrafts((current) => removeDraft(current, index));

  /** 꾹 눌러 드래그한 결과. 개수는 그대로고 날짜만 다시 배치된다. */
  const moveDraft = (from: number, to: number) =>
    setDrafts((current) => reorderDrafts(current, from, to));

  const setRegularOvernightCycle = (index: number, cycleStart: string) =>
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index
          ? { ...draft, regularOvernightCycleStart: cycleStart }
          : draft,
      ),
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
          regularOvernightCycleStart: draft.regularOvernightCycleStart ?? null,
        })),
    [resolved],
  );

  // 폼이 이번에 외출로 잡아둔 구간. 외출은 하루라 주기 선택이 없다.
  const draftOuting = useMemo<SegmentLike[]>(
    () =>
      resolved
        .filter((draft) => isOutingBalanceKey(draft.key))
        .map((draft) => ({
          ...balanceKeyToCategory(draft.key),
          startDate: draft.startDate,
          endDate: draft.endDate,
        })),
    [resolved],
  );

  /**
   * 외출 주기 위반. 갈래마다 따로 보고 먼저 걸리는 것을 알린다 — 평일을 다 썼어도
   * 주말은 그대로 남으므로 둘을 한 판정으로 묶으면 안 된다.
   */
  const outingBlockText = useMemo(() => {
    if (!dischargeAt || !draftOuting.length) return null;
    for (const kind of OUTING_KINDS) {
      const config = outingConfigs.get(kind);
      if (!isOutingCycleBased(config)) continue;
      const block = checkOuting({
        kind,
        config,
        existing: savedSegments,
        requested: draftOuting,
        dischargeAt,
      });
      if (block) return outingBlockMessage(kind, block);
    }
    return null;
  }, [dischargeAt, draftOuting, outingConfigs, savedSegments]);

  // 주기 재원은 총합이 아니라 날짜가 속한 주기로 따진다.
  const regularBlock = useMemo(() => {
    if (!cycleBased || !dischargeAt || !draftRegular.length) return null;
    return checkRegularOvernight({
      config: regularConfig,
      existing: savedSegments,
      requested: draftRegular,
      dischargeAt,
    });
  }, [cycleBased, dischargeAt, regularConfig, savedSegments, draftRegular]);

  /** 폼에서 이미 배정한 몫까지 뺀 실제 남은 일수. */
  const availableByKey = useMemo(() => {
    const used = draftDaysByKey(drafts);
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    // 주기 재원은 스칼라 잔여가 "이번 주기" 값이라 미래 주기를 잘못 막는다.
    // 구간 행마다 그 날짜의 주기로 따로 계산한다(아래 rowAvailable).
    if (cycleBased) result.delete("regular_overnight");
    for (const kind of OUTING_KINDS) {
      if (isOutingCycleBased(outingConfigs.get(kind))) {
        result.delete(outingBalanceKey(kind));
      }
    }
    return result;
  }, [remainingByKey, drafts, cycleBased, outingConfigs]);

  /** 이 구간 날짜가 속한 주기까지 반영한, 행 하나짜리 잔여 표. */
  const rowAvailable = (from: string, to: string): Map<BalanceKey, number> => {
    const result = new Map(availableByKey);
    if (cycleBased) {
      const draft = resolved.find(
        (item) => item.startDate === from && item.endDate === to,
      );
      result.set(
        "regular_overnight",
        regularOvernightAvailableIn({
          config: regularConfig,
          used: [...savedSegments, ...draftRegular],
          dischargeAt,
          from,
          to,
          cycleStart: draft?.regularOvernightCycleStart,
        }),
      );
    }
    // 외출도 같은 이유로 날짜가 속한 주기로 따진다. 주기 선택이 없어 한 줄 더 짧다.
    for (const kind of OUTING_KINDS) {
      const config = outingConfigs.get(kind);
      if (!isOutingCycleBased(config)) continue;
      result.set(
        outingBalanceKey(kind),
        outingAvailableIn({
          kind,
          config,
          used: [...savedSegments, ...draftOuting],
          dischargeAt,
          from,
          to,
        }),
      );
    }
    return result;
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
    ...(outingBlockText ? [outingBlockText] : []),
  ].join(", ");

  /**
   * 외출만의 두 제약. 서버 스키마가 막는 것과 같은 값이라 여기서 먼저 말한다 —
   * 개수 스테퍼로 한 칸만 올려도 400을 받게 두면 이유를 화면에서 알 수 없다.
   *
   *  - 외출은 당일 복귀다(부대관리훈령). 밤을 넘기면 그것은 외박이다.
   *  - 외출은 그 자체로 한 건이다. 연가가 끝나면 복귀하고, 다음 날 나가는 외출은
   *    이어진 하나의 출타가 아니다(@leave/shared의 leave-merge.ts 주석).
   */
  const outingDrafts = drafts.filter((draft) => isOutingBalanceKey(draft.key));
  const outingShapeBlocker: string | null = !outingDrafts.length
    ? null
    : drafts.length > 1
      ? "외출은 다른 휴가와 이어 붙일 수 없어요. 따로 등록해주세요."
      : outingDrafts[0]!.days > 1
        ? "외출은 당일 복귀라 하루로만 등록할 수 있어요."
        : null;

  const needsTitle = !options.deriveTitle;
  /**
   * 주기 재원을 쓰는데 전역일을 아직 모르는 상태.
   *
   * 주기 판정은 전역일이 있어야 성립하고(`checkRegularOvernight`), 주기 재원은
   * 스칼라 잔여 검사에서 일부러 빠져 있다(위 `availableByKey`). 그래서 `me`가 아직
   * 오지 않은 동안은 **정기외박을 며칠이든 통과시킨 뒤 서버 400을 받았다** — 콜드
   * 스타트나 딥링크로 달력에 바로 들어와 폼을 열면 실제로 그 창이 열린다.
   */
  const awaitingDischargeDate =
    cycleBased && !dischargeAt && draftRegular.length > 0;

  /**
   * 저장을 막는 이유. null이면 저장할 수 있다.
   *
   * 구간 수·총 기간 상한은 `leaveCreateSchema`가 거절하는 값과 같아야 한다.
   * 개수 스테퍼로는 한 번에 한 칸씩 넘길 수 있어서, 서버까지 갔다가 400을 받는
   * 대신 여기서 이유를 말한다.
   */
  const submitBlocker: string | null = awaitingDischargeDate
    ? "복무 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요."
    : !startDate
      ? "휴가 시작일을 선택해주세요."
      : drafts.length === 0
        ? "휴가 종류를 선택해주세요."
        : duration > MAX_DATE_RANGE_DAYS
          ? `휴가는 최대 ${MAX_DATE_RANGE_DAYS}일까지 등록할 수 있어요.`
          : drafts.length > MAX_LEAVE_SEGMENTS
            ? `휴가 종류는 최대 ${MAX_LEAVE_SEGMENTS}개까지 이어 쓸 수 있어요.`
            : !/^([01]\d|2[0-3]):[0-5]\d$/.test(returnTime)
              ? "복귀 시간을 HH:mm 형식으로 입력해주세요."
              : needsTitle && title.trim().length === 0
                ? "휴가 제목을 입력해주세요."
                : (outingShapeBlocker ?? (balanceBlockMessage || null));
  const canSubmit = submitBlocker === null;

  /* --- 종류 더하기 도우미 ---------------------------------------------- */
  const lastDraft = resolved[resolved.length - 1];
  /**
   * "다른 종류를 이어 쓰기"를 눌렀을 때 새 구간에 넣을 재원.
   * 잔여가 하루라도 남은 다른 재원이 없으면 버튼 자체를 숨긴다.
   *
   * 새 구간은 하루로 붙고 휴가가 그만큼 길어진다 — 예전처럼 마지막 구간을 반으로
   * 쪼개지 않는다. 개수 모델에서는 총 기간이 파생값이라 나눌 이유가 없다.
   */
  const suggestedAddKey =
    // 외출이 든 휴가에는 다른 종류를 이어 붙일 수 없다 — 버튼 자체를 감춘다.
    lastDraft && !outingDrafts.length && drafts.length < MAX_LEAVE_SEGMENTS
      ? (() => {
          const available = rowAvailable(
            lastDraft.startDate,
            lastDraft.endDate,
          );
          return BALANCE_KEYS.find(
            (key) =>
              key !== lastDraft.key &&
              !isOutingBalanceKey(key) &&
              (available.get(key) ?? 0) >= 1,
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
      returnTime,
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
    returnTime,
    setReturnTime,
    status,
    setStatus,
    startDate,
    /** 개수의 합에서 파생된 휴가 종료일. 고를 수 있는 값이 아니다. */
    endDate,
    /** 달력에서 기간을 고르면 총 일수를 그 길이에 맞춘다. */
    applyRange,
    /** 길이는 그대로 두고 시작일만 옮긴다. */
    moveToStart,
    drafts,
    setDrafts,
    /** 화면에 그릴 구간 목록(실제 날짜가 채워진 상태). */
    resolved,
    /** 구간 편집 — 화면은 이 넷만 부르면 된다. */
    setDraftDays: setDraftDaysAt,
    addDraft,
    removeDraftAt,
    moveDraft,
    regularCycleChoices,
    setRegularOvernightCycle,
    duration,
    validRange,
    selectedSimulation,
    blackoutWarning,
    /**
     * 선택 기간 주변의 부대 일정. 날짜를 고르는 달력이 그린다 — 검열·훈련·행사를
     * 확인하러 달력 화면으로 나갔다 오게 만들지 않기 위한 것이다. 혼잡도 계산이
     * 이미 같은 달들을 받아 두므로 추가 요청은 없다.
     */
    unitEvents: calendar.events,
    recommendations,
    rowAvailable,
    suggestedAddKey,
    balanceBlockMessage,
    submitBlocker,
    canSubmit,
    pending,
    error,
    setError,
    submit,
  };
}
