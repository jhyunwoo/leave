import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLogin } from "../api/queries";
import { Field } from "../components/Field";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();

  const submit = async () => {
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다");
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
        <p
          className="display-xl"
          style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}
          aria-label="리브"
        >
          리브
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "var(--primary)",
              display: "inline-block",
              marginLeft: 6,
            }}
          />
        </p>
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
        <p className="body-sm text-body" style={{ textAlign: "center" }}>
          처음이신가요?{" "}
          <Link to="/signup" className="strong" style={{ color: "var(--ink)" }}>
            가입하기
          </Link>
        </p>
      </form>
    </div>
  );
}
