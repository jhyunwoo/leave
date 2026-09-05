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
  regularOvernightIntervalForm,
  regularOvernightIntervalPayload,
  isValidISODate,
  onboardingProfileSchema,
  onboardingResumeStep,
  onboardingStepIndex,
  onboardingSteps,
  scheduledRank,
  standardDischargeDate,
  todayInSeoul,
  type Branch,
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
import {
  clearPendingInvite,
  readPendingInvite,
  rememberPendingInvite,
} from "../state/pending-invite";
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
import { UsernameStep } from "./onboarding/UsernameStep";
import "./onboarding.css";

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
  // 주기의 단위(일/개월)도 함께 든다 — 군종이 정하지만 군종을 바꿔도 저장된
  // 값을 되살릴 수 있어야 해서 파생값이 아니라 상태다.
  // 문자열로 드는 이유는 OvernightStep의 주석 참고.
  const initialInterval = regularOvernightIntervalForm(
    initial?.branch ?? "army",
    props.status.regularOvernight,
  );
  const [intervalUnit, setIntervalUnit] = useState(initialInterval.unit);
  const [interval, setInterval] = useState(String(initialInterval.value));
  const [daysPerGrant, setDaysPerGrant] = useState(
    String(
      props.status.regularOvernight?.daysPerGrant ??
        REGULAR_OVERNIGHT_DEFAULTS[initial?.branch ?? "army"].daysPerGrant,
    ),
  );
  // 이월은 통상 운영이 아니라 부대 지침이라 기본값을 깔지 않는다 — 꺼진 채로 묻는다.
  const [carryOver, setCarryOver] = useState(
    props.status.regularOvernight?.carryOver ?? false,
  );
  const [inGroup, setInGroup] = useState(Boolean(props.status.unitId));
  // 이름은 이 단계에서 곧바로 서버에 저장된다(UsernameStep 주석). 여기서 드는 값은
  // 뒤로 갔다 돌아왔을 때 입력칸을 비우지 않기 위한 것뿐이다.
  const [username, setUsername] = useState(props.status.username ?? "");
  const [error, setError] = useState<string | null>(null);

  const saveProfile = useSaveOnboardingProfile();
  const saveRegular = useSaveOnboardingRegularOvernight();
  const complete = useCompleteOnboarding();

  const order = onboardingSteps();
  const index = onboardingStepIndex(step);
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

  const advance = () => {
    const next = order[index + 1];
    if (next) go(next);
  };

  const back = () => {
    const previous = order[index - 1];
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
              ...regularOvernightIntervalPayload({
                unit: intervalUnit,
                value: Number(interval),
              }),
              daysPerGrant: Number(daysPerGrant),
              carryOver,
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
      clearPendingInvite();
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
      setRank(scheduledRank(enlistedAt, today));
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
                  setDischargeAt(standardDischargeDate(enlistedAt, next));
                // 주기는 단위까지 군마다 다르다(육군 3개월, 해·공군 42일).
                // 앞 군종의 값을 그대로 두면 다음 화면이 틀린 기본값으로 열린다.
                const form = regularOvernightIntervalForm(next);
                setIntervalUnit(form.unit);
                setInterval(String(form.value));
                setDaysPerGrant(
                  String(REGULAR_OVERNIGHT_DEFAULTS[next].daysPerGrant),
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
          ) : step === "username" ? (
            <UsernameStep
              initial={username}
              onSaved={(saved) => {
                setUsername(saved);
                advance();
              }}
            />
          ) : step === "overnight" ? (
            <OvernightStep
              branch={branch}
              value={startDate}
              onChange={setStartDate}
              intervalUnit={intervalUnit}
              interval={interval}
              onIntervalChange={setInterval}
              daysPerGrant={daysPerGrant}
              onDaysPerGrantChange={setDaysPerGrant}
              carryOver={carryOver}
              onCarryOverChange={setCarryOver}
              error={error}
              pending={saveRegular.isPending}
              onNext={() => void submitOvernight()}
              onSkip={() => void submitOvernight(true)}
            />
          ) : step === "group" ? (
            <GroupStep
              pendingCode={readPendingInvite()}
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
 * 옛 초대 링크(`/invite#코드`) 착지점. 코드를 세션에 옮겨 담고 가입으로 보낸다.
 * 주소창에 코드가 남으면 방문 기록·공유 링크로 새어나갈 수 있어 즉시 지운다.
 *
 * 지금 발급되는 링크는 `/invite/{코드}`이고 `InviteJoinPage`가 받는다.
 * 이 화면은 이미 뿌려진 옛 링크가 죽지 않도록 남겨 둔다 — 프래그먼트는 서버로
 * 가지 않으므로 이쪽 코드는 클라이언트에서만 읽을 수 있다.
 */
export function InviteLandingPage() {
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (code) rememberPendingInvite(code);
    window.history.replaceState(null, "", "/signup");
    window.location.replace("/signup");
  }, []);
  return null;
}
