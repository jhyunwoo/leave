/** 가입에서는 이메일과 비밀번호만 받고 복무정보는 온보딩에서 설정한다. */

import { ActionIcon } from "../components/ActionIcon";

import { signupSchema } from "@leave/shared";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { safeNext, withNext } from "../state/next-destination";
import { useSignup } from "@leave/client";
import { Field } from "../components/Field";
import { LegalLinks } from "../components/LegalLinks";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [notificationOptIn, setNotificationOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signup = useSignup();
  const navigate = useNavigate();
  const location = useLocation();
  // 공유된 프로필 링크로 들어온 신규 사용자도 목적지를 잃지 않는다.
  // 온보딩과 이름 설정은 주소를 바꾸지 않으므로, 그 단계가 끝나면 이 주소가 열린다.
  const next = safeNext(location.search);

  const submit = async () => {
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요");
      return;
    }
    if (!termsAccepted || !privacyAccepted || !ageConfirmed) {
      setError("필수 동의와 만 18세 이상 확인이 필요해요");
      return;
    }

    const input = {
      email: email.trim(),
      password,
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
      void navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했습니다");
    }
  };

  const canSubmit =
    email.includes("@") &&
    password.length >= 8 &&
    password === passwordConfirm &&
    termsAccepted &&
    privacyAccepted &&
    ageConfirmed;

  return (
    // 화면 전체가 이 폼 하나이므로 main 랜드마크로 감싼다. 그러지 않으면
    // 보조기술과 브라우저 에이전트에게 본문의 시작점이 없다(axe: landmark-one-main).
    <main
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
        <h1 className="display-md">리브 계정 만들기</h1>
        <p className="body-sm text-body" style={{ marginTop: "var(--sp-sm)" }}>
          계정을 만든 뒤 필요한 복무정보만 안전하게 설정해요.
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
        {/* 선택 알림 동의를 거부해도 서비스는 이용할 수 있다. */}
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
            label="[필수] 이메일·별칭·군종·입대일·전역예정일·현재 계급·그룹 소속·휴가 날짜 처리에 동의합니다. 거부하면 핵심 기능을 제공할 수 없습니다."
          />
          <ConsentCheckbox
            checked={ageConfirmed}
            onChange={setAgeConfirmed}
            testId="signup-age-confirmation"
            label="[필수] 만 18세 이상이며 소속 부대의 휴대전화·보안 지침을 우선하겠습니다."
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
          <ActionIcon name="userAdd" />
          {signup.isPending ? "가입 중…" : "가입하고 시작"}
        </button>

        <p className="body-sm text-body" style={{ textAlign: "center" }}>
          이미 계정이 있나요?{" "}
          <Link
            to={withNext("/login", next)}
            className="strong"
            style={{ color: "var(--ink)" }}
          >
            로그인
          </Link>
        </p>
      </form>

      <LegalLinks />
    </main>
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
