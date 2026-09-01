/** 로그인 화면. 성공하면 토큰이 저장되고 App.tsx가 달력으로 넘긴다. */

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useLogin, usePasskeyLogin } from "@leave/client";
import { safeNext, withNext } from "../state/next-destination";
import { BrandLockup } from "../components/BrandLockup";
import { Field } from "../components/Field";
import { LegalLinks } from "../components/LegalLinks";
import { getPasskey, passkeysSupported } from "../lib/passkeys";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const passkeyLogin = usePasskeyLogin();
  const navigate = useNavigate();
  const location = useLocation();
  // 공유된 프로필 링크(/u/{username})로 들어왔다가 로그인으로 튕긴 사람을
  // 원래 목적지로 되돌린다. 값 검증은 safeNext가 한다(오픈 리다이렉트 방지).
  const next = safeNext(location.search);

  const submit = async () => {
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      void navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다");
    }
  };

  const submitPasskey = async () => {
    setError(null);
    try {
      await passkeyLogin.mutateAsync(getPasskey);
      void navigate(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "패스키 로그인에 실패했습니다",
      );
    }
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
        gap: "var(--sp-2xl)",
      }}
    >
      <div className="anim-rise" style={{ textAlign: "center" }}>
        <BrandLockup className="display-xl" iconSize={56} />
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-md)" }}>
          부대 휴가, 겹치기 전에 미리 보기.
        </p>
      </div>

      <form
        className="card anim-rise"
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
          animationDelay: "0.08s",
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="display-xs">로그인</h1>
        <Field label="이메일">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
          />
        </Field>
        <Field label="비밀번호">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={login.isPending || !email || !password}
        >
          {login.isPending ? "로그인 중…" : "로그인"}
        </button>
        {passkeysSupported ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={passkeyLogin.isPending}
            onClick={() => void submitPasskey()}
          >
            {passkeyLogin.isPending ? "패스키 확인 중…" : "패스키로 로그인"}
          </button>
        ) : null}
        <p className="body-sm text-body" style={{ textAlign: "center" }}>
          처음이신가요?{" "}
          <Link
            to={withNext("/signup", next)}
            className="strong"
            style={{ color: "var(--ink)" }}
          >
            가입하기
          </Link>
        </p>
      </form>
      <LegalLinks />
    </div>
  );
}
