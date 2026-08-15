/**
 * 가입 후 필수 온보딩 — 한 화면에 질문 하나.
 *
 * 사용처: `App.tsx`가 `onboarding.completed === false`일 때 라우트 대신 띄운다.
 *
 * 화면은 `ONBOARDING_STEP_IDS` 순서를 그대로 따라가고, 육군은 정기외박 단계를
 * 건너뛴다(`onboardingSteps`). 왼쪽 히어로는 답변이 쌓일수록 자라나므로 단계가
 * 늘어난 만큼 지루해지지 않는다.
 *
 * 서버 쓰기는 세 곳뿐이다.
 *  - 계급 단계의 "다음" : 프로필 다섯 필드를 한 벌로 PUT
 *  - 정기외박 단계     : 주기 설정 PUT (건너뛰면 enabled:false)
 *  - 마지막 단계       : 온보딩 완료 POST
 *
 * 프로필을 한 벌로 보내는 건 `onboardingProfileSchema`가 부분 저장을 받지 않기
 * 때문이다. 그래서 1~4단계 값은 이 컴포넌트가 들고 있는다.
 *
 * 이어하기: 앱을 껐다 켜도 서버 상태만 보고 다음 단계로 곧장 간다
 * (`onboardingResumeStep`). 저장을 마친 답은 다시 묻지 않는다.
 */

import {
  REGULAR_OVERNIGHT_DEFAULTS,
  isValidISODate,
  onboardingProfileSchema,
  onboardingResumeStep,
  onboardingStepIndex,
  onboardingSteps,
  scheduledRank,
  standardDischargeDate,
  todayInSeoul,
  type Branch,
  type ISODate,
  type OnboardingStepId,
  type Rank,
} from "@leave/shared";
import {
  useCompleteOnboarding,
  useSaveOnboardingProfile,
  useSaveOnboardingRegularOvernight,
  type OnboardingStatus,
} from "@leave/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLockup } from "../components/BrandLockup";
import { DoneStep } from "./onboarding/DoneStep";
import { GroupStep } from "./onboarding/GroupStep";
import { OvernightStep } from "./onboarding/OvernightStep";
import {
  BranchStep,
  DatesStep,
  NameStep,
  RankStep,
  WelcomeStep,
} from "./onboarding/ProfileSteps";
import { ServiceHero } from "./onboarding/ServiceHero";
import "./onboarding.css";

const PENDING_INVITE_KEY = "leave.pendingInvite";

export function OnboardingPage(props: { status: OnboardingStatus }) {
  const initial = props.status.profile;
  const today = useMemo(() => todayInSeoul(), []);

  const [step, setStep] = useState<OnboardingStepId>(() =>
    onboardingResumeStep(props.status),
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [branch, setBranch] = useState<Branch>(initial?.branch ?? "army");
  const [enlistedAt, setEnlistedAt] = useState(initial?.enlistedAt ?? "");
  const [dischargeAt, setDischargeAt] = useState(initial?.dischargeAt ?? "");
  const [rank, setRank] = useState<Rank>(initial?.rank ?? "private");
  const [rankTouched, setRankTouched] = useState(Boolean(initial));
  const [startDate, setStartDate] = useState(
    props.status.regularOvernight?.startDate ?? "",
  );
  // 주기·회당은 통상 운영값을 깔아 두되 고칠 수 있게 한다. 이어하기를 위해
  // 저장된 값이 있으면 그쪽을 먼저 쓴다(startDate와 같은 규칙).
  // 문자열로 드는 이유는 OvernightStep의 주석 참고.
  const [intervalDays, setIntervalDays] = useState(
    String(
      props.status.regularOvernight?.intervalDays ??
        REGULAR_OVERNIGHT_DEFAULTS.intervalDays,
    ),
  );
  const [daysPerGrant, setDaysPerGrant] = useState(
    String(
      props.status.regularOvernight?.daysPerGrant ??
        REGULAR_OVERNIGHT_DEFAULTS.daysPerGrant,
    ),
  );
  const [inGroup, setInGroup] = useState(Boolean(props.status.unitId));
  const [error, setError] = useState<string | null>(null);

  const saveProfile = useSaveOnboardingProfile();
  const saveRegular = useSaveOnboardingRegularOvernight();
  const complete = useCompleteOnboarding();

  const order = onboardingSteps(branch);
  // 목록에 없는 단계(-1)라도 진행바가 범위를 벗어나지 않게 0으로 접는다.
  const index = Math.max(onboardingStepIndex(branch, step), 0);
  const titleRef = useRef<HTMLDivElement | null>(null);

  // 단계가 바뀌면 새 질문으로 포커스를 옮긴다. 이게 없으면 키보드·스크린리더
  // 사용자는 "다음"을 누른 뒤에도 사라진 버튼 자리에 남는다.
  useEffect(() => {
    const heading =
      titleRef.current?.querySelector<HTMLElement>("[data-ob-title]");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [step]);

  const go = (next: OnboardingStepId) => {
    setError(null);
    setStep(next);
  };

  // 군종을 바꾸면 단계 목록이 달라진다(육군은 정기외박이 빠진다). 현재 단계가
  // 목록에서 사라진 경우 indexOf가 -1이 되어 "다음"이 첫 화면으로 되감기므로,
  // 그럴 때는 목록의 처음이 아니라 마지막 단계 쪽으로 흐르게 한다.
  const advance = () => {
    const at = order.indexOf(step);
    const next = at === -1 ? "group" : order[at + 1];
    if (next) go(next);
  };

  const back = () => {
    const at = order.indexOf(step);
    const previous = at === -1 ? "rank" : order[at - 1];
    if (previous) go(previous);
  };

  /** 계급 단계의 "다음" — 여기서 프로필 한 벌이 처음 서버로 간다. */
  const submitProfile = async () => {
    const parsed = onboardingProfileSchema.safeParse({
      name,
      branch,
      enlistedAt,
      dischargeAt,
      rank,
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      );
    setError(null);
    try {
      await saveProfile.mutateAsync(parsed.data);
      advance();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  const submitOvernight = async (skip = false) => {
    setError(null);
    try {
      await saveRegular.mutateAsync(
        skip || !isValidISODate(startDate)
          ? { enabled: false }
          : {
              enabled: true,
              startDate,
              intervalDays: Number(intervalDays),
              daysPerGrant: Number(daysPerGrant),
            },
      );
      if (skip) setStartDate("");
      advance();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  const finish = async () => {
    setError(null);
    try {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      await complete.mutateAsync();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "완료하지 못했습니다",
      );
    }
  };

  /** 날짜를 이미 받았다면 계급 기본값을 표준 진급표로 맞춰둔다. */
  const enterRankStep = () => {
    if (!rankTouched && isValidISODate(enlistedAt))
      setRank(scheduledRank(enlistedAt as ISODate, today));
    advance();
  };

  return (
    <main className="ob">
      <header className="ob-bar">
        <BrandLockup iconSize={26} />
        <div
          className="ob-steps"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={order.length}
          aria-valuenow={index + 1}
          aria-label={`온보딩 ${index + 1} / ${order.length} 단계`}
        >
          {order.map((id, i) => (
            <span
              key={id}
              className={i < index ? "is-done" : i === index ? "is-now" : ""}
            />
          ))}
        </div>
        <button
          type="button"
          className="ob-back"
          onClick={back}
          disabled={index <= 0}
          data-testid="onboarding-back"
        >
          뒤로
        </button>
      </header>

      <div className="ob-body">
        <aside className="ob-stage">
          <ServiceHero
            step={step}
            branch={branch}
            name={name}
            enlistedAt={enlistedAt}
            dischargeAt={dischargeAt}
            overnightStartDate={startDate}
            inGroup={inGroup}
            today={today}
          />
        </aside>

        <section
          className="ob-panel"
          key={step}
          ref={titleRef}
          data-testid={`onboarding-step-${step}`}
        >
          {step === "welcome" ? (
            <WelcomeStep onNext={advance} />
          ) : step === "name" ? (
            <NameStep
              value={name}
              onChange={setName}
              error={error}
              onNext={advance}
            />
          ) : step === "branch" ? (
            <BranchStep
              value={branch}
              onChange={(next) => {
                setBranch(next);
                // 전역일은 군종에 딸린 값이라 함께 다시 계산한다.
                if (isValidISODate(enlistedAt))
                  setDischargeAt(
                    standardDischargeDate(enlistedAt as ISODate, next),
                  );
              }}
              onNext={advance}
            />
          ) : step === "dates" ? (
            <DatesStep
              branch={branch}
              enlistedAt={enlistedAt}
              dischargeAt={dischargeAt}
              onChange={(next) => {
                setEnlistedAt(next.enlistedAt);
                setDischargeAt(next.dischargeAt);
              }}
              error={error}
              onNext={enterRankStep}
            />
          ) : step === "rank" ? (
            <RankStep
              enlistedAt={enlistedAt}
              today={today}
              value={rank}
              onChange={(next) => {
                setRank(next);
                setRankTouched(true);
              }}
              error={error}
              pending={saveProfile.isPending}
              onNext={() => void submitProfile()}
            />
          ) : step === "overnight" ? (
            <OvernightStep
              branch={branch}
              value={startDate}
              onChange={setStartDate}
              intervalDays={intervalDays}
              onIntervalDaysChange={setIntervalDays}
              daysPerGrant={daysPerGrant}
              onDaysPerGrantChange={setDaysPerGrant}
              error={error}
              pending={saveRegular.isPending}
              onNext={() => void submitOvernight()}
              onSkip={() => void submitOvernight(true)}
            />
          ) : step === "group" ? (
            <GroupStep
              pendingCode={sessionStorage.getItem(PENDING_INVITE_KEY) ?? ""}
              inGroup={inGroup}
              onDone={(joined) => {
                setInGroup(joined);
                advance();
              }}
            />
          ) : (
            <DoneStep
              name={name}
              branch={branch}
              enlistedAt={enlistedAt}
              dischargeAt={dischargeAt}
              rank={rank}
              overnightStartDate={startDate}
              inGroup={inGroup}
              today={today}
              error={error}
              pending={complete.isPending}
              onComplete={() => void finish()}
            />
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * 초대 링크 착지점. 코드를 세션에 옮겨 담고 가입으로 보낸다.
 * 주소창에 코드가 남으면 방문 기록·공유 링크로 새어나갈 수 있어 즉시 지운다.
 */
export function InviteLandingPage() {
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (code) sessionStorage.setItem(PENDING_INVITE_KEY, code);
    window.history.replaceState(null, "", "/signup");
    window.location.replace("/signup");
  }, []);
  return null;
}
