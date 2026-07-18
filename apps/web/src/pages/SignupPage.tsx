import {
  addMonthsClamped,
  BRANCH_LABELS,
  BRANCHES,
  RANK_LABELS,
  RANKS,
  SERVICE_MONTHS,
  signupSchema,
  type Branch,
  type Rank,
} from "@leave/shared";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { API_URL, getAuthToken } from "../api/client";
import { useSignup } from "../api/queries";
import { Field } from "../components/Field";

const STEPS = ["계정", "군 정보", "프로필"] as const;

export function SignupPage() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<Branch>("army");
  const [enlistedAt, setEnlistedAt] = useState("");
  const [dischargeAt, setDischargeAt] = useState("");
  const [dischargeTouched, setDischargeTouched] = useState(false);
  const [rank, setRank] = useState<Rank>("private");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // 개인정보(접속 기록·푸시 로그) 수집·이용 동의
  const [dataConsent, setDataConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const signup = useSignup();
  const navigate = useNavigate();

  const suggestDischarge = (b: Branch, enlisted: string) => {
    if (enlisted && !dischargeTouched) {
      // 전역 예정일 = 입대일 + 복무기간 - 1일에 근사한 입대일+개월 값 제안
      setDischargeAt(addMonthsClamped(enlisted, SERVICE_MONTHS[b]));
    }
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!email.includes("@")) return "올바른 이메일 주소를 입력해주세요";
      if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다";
      if (password !== passwordConfirm) return "비밀번호가 서로 달라요";
      if (!name.trim()) return "이름을 입력해주세요";
    }
    if (step === 1) {
      if (!enlistedAt) return "입대일을 선택해주세요";
      if (!dischargeAt) return "전역 예정일을 선택해주세요";
      if (enlistedAt >= dischargeAt)
        return "전역 예정일은 입대일보다 뒤여야 합니다";
    }
    return null;
  };

  const next = () => {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((s) => s + 1);
  };

  const submit = async () => {
    const input = {
      email,
      password,
      name: name.trim(),
      branch,
      enlistedAt,
      dischargeAt,
      rank,
      dataConsent,
    };
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    setError(null);
    try {
      await signup.mutateAsync(parsed.data);
      if (photo) {
        await fetch(`${API_URL}/images/profile`, {
          method: "PUT",
          headers: {
            "content-type": photo.type,
            Authorization: `Bearer ${getAuthToken() ?? ""}`,
          },
          body: photo,
        }).catch(() => null); // 사진 업로드 실패는 가입을 막지 않는다
      }
      navigate("/units", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했습니다");
      if (err instanceof Error && err.message.includes("이메일")) setStep(0);
    }
  };

  const onPickPhoto = (file: File | null) => {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-xl)",
        gap: "var(--sp-xl)",
      }}
    >
      <div className="anim-rise" style={{ textAlign: "center" }}>
        <h1 className="display-md">가입하기</h1>
        <div
          style={{
            display: "flex",
            gap: "var(--sp-sm)",
            justifyContent: "center",
            marginTop: "var(--sp-lg)",
          }}
          aria-label={`단계 ${step + 1} / ${STEPS.length}: ${STEPS[step]}`}
        >
          {STEPS.map((label, i) => (
            <span
              key={label}
              className="caption"
              style={{
                padding: "4px 12px",
                borderRadius: "var(--r-pill)",
                fontWeight: 600,
                background: i === step ? "var(--primary)" : "var(--canvas)",
                color: i === step ? "var(--on-primary)" : "var(--mute)",
                transition: "background-color 0.2s ease",
              }}
            >
              {i + 1} {label}
            </span>
          ))}
        </div>
      </div>

      <form
        className="card anim-rise"
        style={{
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) next();
          else void submit();
        }}
      >
        {step === 0 && (
          <>
            <Field label="이메일">
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                autoFocus
              />
            </Field>
            <Field label="비밀번호" hint="8자 이상">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="비밀번호 확인">
              <input
                className="input"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="이름">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                autoComplete="name"
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="군 종류">
              <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                {BRANCHES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={`btn btn-sm ${branch === b ? "btn-primary" : "btn-secondary"}`}
                    style={{ flex: 1 }}
                    aria-pressed={branch === b}
                    onClick={() => {
                      setBranch(b);
                      suggestDischarge(b, enlistedAt);
                    }}
                  >
                    {BRANCH_LABELS[b]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="입대일">
              <input
                className="input"
                type="date"
                value={enlistedAt}
                onChange={(e) => {
                  setEnlistedAt(e.target.value);
                  suggestDischarge(branch, e.target.value);
                }}
              />
            </Field>
            <Field
              label="전역 예정일"
              hint={`${BRANCH_LABELS[branch]} 복무기간 ${SERVICE_MONTHS[branch]}개월 기준으로 자동 입력돼요`}
            >
              <input
                className="input"
                type="date"
                value={dischargeAt}
                onChange={(e) => {
                  setDischargeAt(e.target.value);
                  setDischargeTouched(true);
                }}
              />
            </Field>
            <Field label="현재 계급" hint="복무기간에 따라 자동으로 진급돼요">
              <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                {RANKS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`btn btn-sm ${rank === r ? "btn-primary" : "btn-secondary"}`}
                    style={{ flex: 1 }}
                    aria-pressed={rank === r}
                    onClick={() => setRank(r)}
                  >
                    {RANK_LABELS[r]}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--sp-lg)",
              }}
            >
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="프로필 사진 선택"
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: "50%",
                  border: "2px dashed rgba(14,15,12,0.25)",
                  background: photoPreview
                    ? `center / cover url(${photoPreview})`
                    : "var(--canvas-soft)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--mute)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {!photoPreview && "사진 선택"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              <p className="caption text-mute">
                프로필 사진은 선택이에요. 나중에 바꿀 수 있어요.
              </p>
            </div>

            <div className="card-sage" style={{ padding: "var(--sp-lg)" }}>
              <p className="body-sm strong">{name}</p>
              <p className="caption text-body" style={{ marginTop: 4 }}>
                {BRANCH_LABELS[branch]} · {RANK_LABELS[rank]} · 입대 {enlistedAt}{" "}
                · 전역 {dischargeAt}
              </p>
            </div>

            {/* 개인정보 수집·이용 동의 (접속 기록·푸시 로그) */}
            <label
              style={{
                display: "flex",
                gap: "var(--sp-sm)",
                alignItems: "flex-start",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={dataConsent}
                onChange={(e) => setDataConsent(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span className="caption text-body">
                서비스 운영·보안을 위해 접속 기록(접속 시각·기기 플랫폼·앱 버전
                등)과 이 앱의 푸시 알림 발송·수신 기록을 수집·이용하는 데
                동의합니다. 수집된 내 기록은 앱에서 언제든 열람할 수 있습니다.
              </span>
            </label>
          </>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "var(--sp-md)" }}>
          {step > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => {
                setError(null);
                setStep((s) => s - 1);
              }}
            >
              이전
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 2 }}
            disabled={signup.isPending || (step === 2 && !dataConsent)}
          >
            {step < 2 ? "다음" : signup.isPending ? "가입 중…" : "가입 완료"}
          </button>
        </div>

        <p className="body-sm text-body" style={{ textAlign: "center" }}>
          이미 계정이 있나요?{" "}
          <Link to="/login" className="strong" style={{ color: "var(--ink)" }}>
            로그인
          </Link>
        </p>
      </form>
    </div>
  );
}
