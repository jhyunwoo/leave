import {
  BRANCHES,
  BRANCH_LABELS,
  RANKS,
  RANK_LABELS,
  REGULAR_OVERNIGHT_DEFAULTS,
  REGULAR_OVERNIGHT_SOURCES,
  REGULAR_OVERNIGHT_VERIFIED_AT,
  addDays,
  onboardingProfileSchema,
  regularOvernightGuidance,
  standardDischargeDate,
  unitCreateSchema,
  unitJoinSchema,
  type Branch,
  type ISODate,
  type Rank,
} from "@leave/shared";
import {
  useCompleteOnboarding,
  useCreateUnit,
  useJoinUnit,
  useSaveOnboardingProfile,
  useSaveOnboardingRegularOvernight,
  type IssuedUnitInvite,
  type OnboardingStatus,
} from "@leave/client";
import { useEffect, useState } from "react";
import { Field } from "../components/Field";

const PENDING_INVITE_KEY = "leave.pendingInvite";

export function OnboardingPage(props: { status: OnboardingStatus }) {
  const initial = props.status.profile;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(initial?.name ?? "");
  const [branch, setBranch] = useState<Branch>(initial?.branch ?? "army");
  const [enlistedAt, setEnlistedAt] = useState(initial?.enlistedAt ?? "");
  const [dischargeAt, setDischargeAt] = useState(initial?.dischargeAt ?? "");
  const [rank, setRank] = useState<Rank>(initial?.rank ?? "private");
  const [startDate, setStartDate] = useState(
    props.status.regularOvernight?.startDate ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const saveProfile = useSaveOnboardingProfile();
  const saveRegular = useSaveOnboardingRegularOvernight();
  const complete = useCompleteOnboarding();

  const nextProfile = async () => {
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
      setStep(branch === "army" ? 3 : 2);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  const saveOvernight = async (skip = false) => {
    setError(null);
    try {
      await saveRegular.mutateAsync(
        skip || !startDate
          ? { enabled: false }
          : {
              enabled: true,
              startDate,
              ...REGULAR_OVERNIGHT_DEFAULTS,
            },
      );
      setStep(3);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <main className="onboarding-shell">
      <header className="onboarding-top">
        <strong>리브</strong>
        <span>{step} / 3</span>
      </header>
      <div className="onboarding-progress" aria-hidden>
        <span style={{ width: `${step * 33.333}%` }} />
      </div>
      {step === 1 ? (
        <section className="onboarding-grid single">
          <div className="onboarding-form">
            <h1 className="display-md">내 복무 정보</h1>
            <p className="body-lg text-body">
              휴가 계산에 필요한 정보만 입력해요.
            </p>
            <Field
              label="그룹에서 쓸 별칭"
              hint="실명·군번·기수는 입력하지 마세요."
            >
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 라임고래"
              />
            </Field>
            <Field label="군종">
              <div className="onboarding-segments">
                {BRANCHES.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={branch === value ? "selected" : ""}
                    onClick={() => {
                      setBranch(value);
                      if (enlistedAt)
                        setDischargeAt(
                          standardDischargeDate(enlistedAt as ISODate, value),
                        );
                    }}
                  >
                    {BRANCH_LABELS[value]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="onboarding-pair">
              <Field label="입대일">
                <input
                  className="input"
                  type="date"
                  value={enlistedAt}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEnlistedAt(next);
                    if (next)
                      setDischargeAt(
                        standardDischargeDate(next as ISODate, branch),
                      );
                  }}
                />
              </Field>
              <Field
                label="전역 예정일"
                hint="입대일과 군종으로 자동 계산했어요."
              >
                <input
                  className="input"
                  type="date"
                  value={dischargeAt}
                  onChange={(e) => setDischargeAt(e.target.value)}
                />
              </Field>
            </div>
            <Field label="현재 계급">
              <div className="onboarding-segments">
                {RANKS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={rank === value ? "selected" : ""}
                    onClick={() => setRank(value)}
                  >
                    {RANK_LABELS[value]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="onboarding-notice">
              🔒 실명·군번·기수·실제 부대명은 입력하지 마세요.
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn-primary"
              disabled={saveProfile.isPending}
              onClick={() => void nextProfile()}
            >
              다음
            </button>
          </div>
        </section>
      ) : step === 2 ? (
        <OvernightStep
          branch={branch}
          startDate={startDate}
          setStartDate={setStartDate}
          error={error}
          pending={saveRegular.isPending}
          onBack={() => setStep(1)}
          onSave={() => void saveOvernight()}
          onSkip={() => void saveOvernight(true)}
        />
      ) : (
        <ShareStep
          unitId={props.status.unitId}
          pending={complete.isPending}
          onBack={() => setStep(branch === "army" ? 1 : 2)}
          onComplete={async () => {
            await complete.mutateAsync();
          }}
        />
      )}
    </main>
  );
}

function OvernightStep(props: {
  branch: Branch;
  startDate: string;
  setStartDate: (v: string) => void;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const guidance = regularOvernightGuidance(props.branch)!;
  return (
    <section className="onboarding-grid">
      <div className="onboarding-form">
        <h1 className="display-md">정기외박 설정</h1>
        <p className="body-lg text-body">{guidance.summary}</p>
        <Field
          label="주기 기준일"
          hint="부대에서 안내받은 실제 기준일을 입력하세요."
        >
          <input
            className="input"
            type="date"
            value={props.startDate}
            onChange={(e) => props.setStartDate(e.target.value)}
          />
        </Field>
        {props.startDate && (
          <p className="body-sm text-body">
            첫 사용 가능 주기는 {addDays(props.startDate as ISODate, 42)}
            부터예요.
          </p>
        )}
        <div className="onboarding-pair">
          <div className="metric-field">
            <span>주기</span>
            <strong>42일</strong>
          </div>
          <div className="metric-field">
            <span>회당</span>
            <strong>3일</strong>
          </div>
        </div>
        {props.error && (
          <p className="field-error" role="alert">
            {props.error}
          </p>
        )}
        <div className="onboarding-actions">
          <button className="btn btn-secondary" onClick={props.onBack}>
            이전
          </button>
          <button
            className="btn btn-primary"
            disabled={!props.startDate || props.pending}
            onClick={props.onSave}
          >
            설정 저장
          </button>
        </div>
        <button className="text-action" onClick={props.onSkip}>
          기준일을 몰라요 · 나중에 설정
        </button>
      </div>
      <aside className="regulation-panel">
        <h2 className="display-xs">규정과 실제 운영</h2>
        <h3>공통 기준</h3>
        <p>{guidance.disclaimer}</p>
        <h3>해군·공군 운영</h3>
        <p>
          국방부 자료 기준 일반적으로 6주마다 2박 3일이며, 부대와 근무형태에
          따라 달라요.
        </p>
        <h3>시작일</h3>
        <p>{guidance.detail}</p>
        <div className="source-links">
          {REGULAR_OVERNIGHT_SOURCES.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              {source.label} ↗
            </a>
          ))}
        </div>
        <p className="caption text-mute">
          공개 자료 확인 {REGULAR_OVERNIGHT_VERIFIED_AT} · 공식 일정 확정 기능이
          아니며 소속 부대 지침이 우선합니다.
        </p>
      </aside>
    </section>
  );
}

function ShareStep(props: {
  unitId: string | null;
  pending: boolean;
  onBack: () => void;
  onComplete: () => Promise<void>;
}) {
  const pendingCode = sessionStorage.getItem(PENDING_INVITE_KEY) ?? "";
  const [mode, setMode] = useState<"choice" | "join" | "create">(
    pendingCode ? "join" : "choice",
  );
  const [code, setCode] = useState(pendingCode);
  const [groupName, setGroupName] = useState("");
  const [maxCount, setMaxCount] = useState("1");
  const [invite, setInvite] = useState<IssuedUnitInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();
  const join = useJoinUnit();
  const finish = async () => {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    await props.onComplete();
  };
  const joinGroup = async () => {
    const parsed = unitJoinSchema.safeParse({ code });
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? "코드를 확인해주세요");
    try {
      await join.mutateAsync(parsed.data);
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "참여하지 못했습니다");
    }
  };
  const createGroup = async () => {
    const parsed = unitCreateSchema.safeParse({
      name: groupName,
      maxLeaveCount: Number(maxCount),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      );
    try {
      const result = await create.mutateAsync(parsed.data);
      setInvite(result.invite);
    } catch (e) {
      setError(e instanceof Error ? e.message : "그룹을 만들지 못했습니다");
    }
  };
  const shareUrl = invite
    ? `${window.location.origin}/invite#${invite.code}`
    : "";
  const share = async () => {
    const text = `리브에서 함께 휴가를 관리해요.\n${shareUrl}\n초대코드: ${invite?.code}`;
    if (navigator.share)
      await navigator.share({ title: "리브 공유 그룹 초대", text });
    else await navigator.clipboard.writeText(text);
  };
  if (invite)
    return (
      <section className="onboarding-grid single">
        <div className="onboarding-form">
          <h1 className="display-md">동료를 초대해보세요</h1>
          <p className="body-lg text-body">
            초대코드는 이 화면에서 한 번만 보여요.
          </p>
          <div className="invite-code">{invite.code}</div>
          <p className="caption text-body">
            {new Date(invite.expiresAt).toLocaleString("ko-KR")}까지 · 최대{" "}
            {invite.maxUses}회
          </p>
          <button className="btn btn-primary" onClick={() => void share()}>
            안전하게 공유
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void navigator.clipboard.writeText(invite.code)}
          >
            코드 복사
          </button>
          <button className="text-action" onClick={() => void finish()}>
            온보딩 완료
          </button>
          <p className="caption text-mute">
            서버에는 초대코드의 해시값만 저장됩니다.
          </p>
        </div>
      </section>
    );
  if (props.unitId)
    return (
      <section className="onboarding-grid single">
        <div className="onboarding-form">
          <h1 className="display-md">이미 함께 관리 중이에요</h1>
          <p className="body-lg text-body">
            현재 공유 그룹의 휴가 계획을 바로 이어서 관리할 수 있어요.
          </p>
          <button className="btn btn-primary" onClick={() => void finish()}>
            온보딩 완료
          </button>
        </div>
      </section>
    );
  return (
    <section className="onboarding-grid single">
      <div className="onboarding-form">
        <h1 className="display-md">함께 관리하면 더 정확해요</h1>
        <p className="body-lg text-body">
          같은 그룹의 계획이 모일수록 날짜별 출타 현황을 제대로 볼 수 있어요.
        </p>
        {mode === "choice" ? (
          <>
            <div className="share-visual" aria-hidden>
              ◯ ─┐
              <br />◯ ─┼─ ▦<br />◯ ─┘
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setMode("create")}
            >
              새 공유 그룹 만들기
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setMode("join")}
            >
              초대코드로 참여
            </button>
          </>
        ) : mode === "join" ? (
          <>
            <Field label="초대코드">
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <button
              className="btn btn-primary"
              onClick={() => void joinGroup()}
            >
              그룹 참여
            </button>
            <button className="text-action" onClick={() => setMode("choice")}>
              다른 방법 선택
            </button>
          </>
        ) : (
          <>
            <Field label="공유 그룹 이름">
              <input
                className="input"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="예: 여름 휴가방"
              />
            </Field>
            <Field label="하루 최대 출타 인원">
              <input
                className="input"
                type="number"
                min="0"
                value={maxCount}
                onChange={(e) => setMaxCount(e.target.value)}
              />
            </Field>
            <button
              className="btn btn-primary"
              onClick={() => void createGroup()}
            >
              그룹 만들기
            </button>
            <button className="text-action" onClick={() => setMode("choice")}>
              다른 방법 선택
            </button>
          </>
        )}
        {error && <p className="field-error">{error}</p>}
        <button
          className="text-action"
          disabled={props.pending}
          onClick={() => void finish()}
        >
          나중에 하기
        </button>
        <div className="onboarding-notice">
          실제 부대명·부대번호·주소·병력 현황은 공유하지 마세요.
        </div>
      </div>
    </section>
  );
}

export function InviteLandingPage() {
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (code) sessionStorage.setItem(PENDING_INVITE_KEY, code);
    window.history.replaceState(null, "", "/signup");
    window.location.replace("/signup");
  }, []);
  return null;
}
