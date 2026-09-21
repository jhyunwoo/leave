import {
  useEmailVerification,
  useLogout,
  useDeleteAccount,
} from "@leave/client";
import { Field } from "../components/Field";

export function VerifyEmailPage({ email }: { email: string }) {
  const form = useEmailVerification();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-xl)",
      }}
    >
      <form
        className="card anim-rise"
        style={{
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void form.verify();
        }}
      >
        <h1 className="display-md">이메일 인증</h1>
        <p className="body-sm text-body" style={{ overflowWrap: "anywhere" }}>
          <strong>{email}</strong> 주소로 인증 코드를 받아주세요. 인증을 마치면
          리브를 시작할 수 있어요.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={form.busy || form.remaining > 0}
          onClick={() => void form.send()}
        >
          {form.remaining > 0
            ? `${form.remaining}초 후 재발송 가능`
            : form.sent
              ? "인증 코드 다시 보내기"
              : "인증 코드 보내기"}
        </button>
        {form.message && (
          <p role="status" className="body-sm text-body">
            {form.message}
          </p>
        )}
        <Field label="인증 코드" hint="메일에 적힌 숫자 6자리를 입력해주세요">
          <input
            className="input"
            value={form.code}
            onChange={(event) => form.setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
          />
        </Field>
        {form.error && (
          <p role="alert" className="field-error">
            {form.error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!form.canVerify}
        >
          인증 완료
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          로그아웃
        </button>
        <p className="body-sm text-body">
          이메일을 잘못 입력했다면 계정을 삭제한 뒤 다시 가입할 수 있어요.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={deleteAccount.isPending || form.busy}
          onClick={() => {
            if (
              window.confirm(
                "이 계정을 삭제하고 다시 가입할까요? 삭제한 계정은 복구할 수 없어요.",
              )
            )
              deleteAccount.mutate();
          }}
        >
          계정 삭제 후 다시 가입
        </button>
        {deleteAccount.error && (
          <p role="alert" className="field-error">
            {deleteAccount.error.message}
          </p>
        )}
      </form>
    </main>
  );
}
