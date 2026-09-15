/**
 * 관리자 로그인 화면.
 * 성공하면 서버가 HttpOnly 세션 쿠키를 심고, 응답의 관리자 정보로 앱 상태를 채운다.
 */

import { LoaderCircle, LockKeyhole, KeyRound, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, type AdminAccount, ApiError } from "../api/client";
import { getPasskey, passkeysSupported } from "../lib/passkeys";

export function LoginPage({
  onSuccess,
}: {
  onSuccess: (admin: AdminAccount) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await api.post<{ admin: AdminAccount }>("/auth/login", {
        email,
        password,
      });
      onSuccess(result.admin);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "로그인 중 오류가 발생했습니다",
      );
    } finally {
      setPending(false);
    }
  };

  const submitPasskey = async () => {
    setError("");
    setPending(true);
    try {
      const begin = await api.post<{
        ceremonyId: string;
        options: Record<string, unknown>;
      }>("/auth/passkeys/authentication/options");
      const response = await getPasskey(begin.options);
      const result = await api.post<{ admin: AdminAccount }>(
        "/auth/passkeys/authentication/verify",
        { ceremonyId: begin.ceremonyId, response },
      );
      onSuccess(result.admin);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "패스키 로그인에 실패했습니다",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <strong>리브 관리자</strong>
        </div>
        <div className="auth-heading">
          <span className="auth-lock" aria-hidden="true">
            <LockKeyhole size={24} />
          </span>
          <h1>관리자 로그인</h1>
          <p>운영 데이터에 접근하려면 관리자 계정으로 로그인하세요.</p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="auth-form">
          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button primary auth-submit"
            type="submit"
            disabled={pending || !email || !password}
          >
            {pending ? (
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
            ) : (
              <LogIn size={18} aria-hidden="true" />
            )}
            {pending ? "확인 중…" : "로그인"}
          </button>
          {passkeysSupported ? (
            <button
              className="button secondary auth-submit"
              type="button"
              disabled={pending}
              onClick={() => void submitPasskey()}
            >
              <KeyRound size={17} aria-hidden="true" />
              패스키로 로그인
            </button>
          ) : null}
        </form>
        <p className="auth-notice">
          로그인과 모든 데이터 변경은 보안 감사 기록에 남습니다.
        </p>
      </section>
    </main>
  );
}
