/**
 * 관리자 비밀번호 변경 화면.
 *
 * `required`가 true면 임시 비밀번호로 처음 로그인한 상태다. 이때는 다른 화면으로
 * 나갈 수 없고(App.tsx가 라우트를 막는다) 변경을 마쳐야 운영 API가 열린다.
 */

import { KeyRound, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api, ApiError, type AdminAccount } from "../api/client";
import { useToast } from "../components/ui";

export function ChangePasswordPage({
  required,
  onChanged,
}: {
  required: boolean;
  onChanged: (admin: AdminAccount) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호 확인이 일치하지 않습니다");
      return;
    }
    setPending(true);
    try {
      const result = await api.post<{ admin: AdminAccount }>(
        "/auth/change-password",
        { currentPassword, newPassword },
      );
      onChanged(result.admin);
      toast.success("비밀번호를 변경했습니다");
      void navigate("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "비밀번호를 변경하지 못했습니다",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="settings-card password-card">
      <div className="settings-card-icon">
        <KeyRound size={24} />
      </div>
      <div>
        <h2>{required ? "임시 비밀번호를 변경해주세요" : "비밀번호 변경"}</h2>
        <p>
          12자 이상의 새 비밀번호를 사용하세요. 변경하면 다른 관리자 세션은 모두
          종료됩니다.
        </p>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="form-grid single"
      >
        <label className="field">
          <span>현재 비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>새 비밀번호</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>새 비밀번호 확인</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          {!required ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => void navigate(-1)}
            >
              취소
            </button>
          ) : null}
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={17} /> : null}
            비밀번호 변경
          </button>
        </div>
      </form>
    </section>
  );
}
