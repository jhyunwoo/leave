/**
 * 회원가입 화면.
 * 입대일과 군 종류를 넣으면 전역 예정일과 현재 계급이 자동으로 계산된다
 * (@leave/shared의 rank 규칙). 사용자는 그 값을 확인만 하면 된다.
 */

import { signupSchema } from "@leave/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useSignup } from "@leave/client";
import { Field } from "../components/Field";
import { LegalLinks } from "../components/LegalLinks";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";

/**
 * 출시 전 최소수집 가입 화면. 네이티브 `screens/signup.tsx`와 같은 계약을 쓴다.
 *
 * 현재 서버의 구버전 입력 계약에 남아 있는 군종·입대/전역일·계급에는 사용자에게서
 * 받은 값이 아니라 무의미한 고정값을 보낸다. 서버 마이그레이션 뒤에는 이 호환 필드도
 * 함께 제거한다. 따라서 웹도 군 복무 정보나 사진을 사용자에게 요청하지 않는다.
 */
export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [alias, setAlias] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [notificationOptIn, setNotificationOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signup = useSignup();
  const navigate = useNavigate();

  const submit = async () => {
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요");
      return;
    }
    if (!termsAccepted || !privacyAccepted || !ageConfirmed) {
      setError("필수 동의와 만 14세 이상 확인이 필요해요");
      return;
    }

    const input = {
      email: email.trim(),
      password,
      name: alias.trim(),
      // 구 API 호환 전용 고정값: 실제 군 복무 정보를 수집하지 않는다.
      branch: "army" as const,
      enlistedAt: "2000-01-01",
      dischargeAt: "2000-01-02",
      rank: "private" as const,
      dataConsent: privacyAccepted,
    };
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }

    setError(null);
    try {
      await signup.mutateAsync(parsed.data);
      // 알림 선택은 가입을 막지 않는다. 로그인 후 알림의 가치를 확인한
      // 설정 화면에서 다시 선택한다.
      void notificationOptIn;
      navigate("/units", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했습니다");
    }
  };

  const canSubmit =
    email.includes("@") &&
    password.length >= 8 &&
    password === passwordConfirm &&
    alias.trim().length > 0 &&
    termsAccepted &&
    privacyAccepted &&
    ageConfirmed;

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
        <h1 className="display-md">60초 안에 시작하기</h1>
        <p className="body-sm text-body" style={{ marginTop: "var(--sp-sm)" }}>
          실제 이름·군번·계급·부대명·사진은 받지 않아요.
        </p>
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
          void submit();
        }}
      >
        <OfficialDisclaimer />

        <Field label="이메일" hint="로그인과 계정 복구에만 사용해요">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
            data-testid="signup-email"
          />
        </Field>
        <Field label="비밀번호" hint="8자 이상">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            data-testid="signup-password"
          />
        </Field>
        <Field label="비밀번호 확인">
          <input
            className="input"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            data-testid="signup-password-confirm"
          />
        </Field>
        <Field
          label="그룹에서 쓸 별칭"
          hint="실명·군번·계급·기수는 입력하지 마세요"
        >
          <input
            className="input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="예: 라임고래"
            maxLength={24}
            data-testid="signup-name"
          />
        </Field>

        {/* 목적별 분리 동의 — 선택 항목을 거부해도 서비스는 이용할 수 있다. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-md)",
          }}
        >
          <ConsentCheckbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            testId="signup-terms-consent"
            label="[필수] 이용약관과 금지행위(공식 문서·병력·작전 정보 입력 금지)에 동의합니다."
          />
          <ConsentCheckbox
            checked={privacyAccepted}
            onChange={setPrivacyAccepted}
            testId="signup-data-consent"
            label="[필수] 이메일·별칭·그룹 소속·휴가 날짜 처리에 동의합니다. 거부하면 핵심 기능을 제공할 수 없습니다."
          />
          <ConsentCheckbox
            checked={ageConfirmed}
            onChange={setAgeConfirmed}
            testId="signup-age-confirmation"
            label="[필수] 만 14세 이상이며 소속 부대의 휴대전화·보안 지침을 우선하겠습니다."
          />
          <ConsentCheckbox
            checked={notificationOptIn}
            onChange={setNotificationOptIn}
            testId="signup-notification-consent"
            label="[선택] 내 계획 날짜의 상태 변동 알림을 받고 싶습니다. 미동의해도 앱을 이용할 수 있습니다."
          />
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={signup.isPending || !canSubmit}
          data-testid="signup-next"
        >
          {signup.isPending ? "가입 중…" : "가입하고 시작"}
        </button>

        <p className="body-sm text-body" style={{ textAlign: "center" }}>
          이미 계정이 있나요?{" "}
          <Link to="/login" className="strong" style={{ color: "var(--ink)" }}>
            로그인
          </Link>
        </p>
      </form>

      <LegalLinks />
    </div>
  );
}

function ConsentCheckbox(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  testId: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "var(--sp-sm)",
        alignItems: "flex-start",
        cursor: "pointer",
        minHeight: 44,
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        style={{ marginTop: 3, width: 20, height: 20, flexShrink: 0 }}
        data-testid={props.testId}
      />
      <span className="caption text-body">{props.label}</span>
    </label>
  );
}
