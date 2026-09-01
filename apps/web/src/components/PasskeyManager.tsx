import { useState } from "react";
import {
  useDeletePasskey,
  usePasskeys,
  useRegisterPasskey,
} from "@leave/client";
import { createPasskey, passkeysSupported } from "../lib/passkeys";

export function PasskeyManager() {
  const passkeys = usePasskeys();
  const register = useRegisterPasskey();
  const remove = useDeletePasskey();
  const [name, setName] = useState("내 패스키");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await register.mutateAsync({
        name,
        currentPassword: password,
        createCredential: createPasskey,
      });
      setPassword("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "패스키를 등록하지 못했습니다",
      );
    }
  };

  const deleteOne = async (id: string) => {
    const currentPassword = window.prompt(
      "패스키를 삭제하려면 현재 비밀번호를 입력해주세요.",
    );
    if (!currentPassword) return;
    setError(null);
    try {
      await remove.mutateAsync({ id, currentPassword });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "패스키를 삭제하지 못했습니다",
      );
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}
    >
      <div>
        <h2 className="display-xs">패스키</h2>
        <p className="body-sm text-body">
          기기의 화면 잠금으로 안전하고 빠르게 로그인할 수 있어요.
        </p>
      </div>
      {passkeys.data?.passkeys.map((passkey) => (
        <div
          key={passkey.id}
          style={{ display: "flex", alignItems: "center", gap: "var(--sp-md)" }}
        >
          <div style={{ flex: 1 }}>
            <p className="strong">{passkey.name}</p>
            <p className="caption text-mute">
              {new Date(passkey.createdAt).toLocaleDateString("ko-KR")} 등록
            </p>
          </div>
          <button
            type="button"
            className="btn btn-tertiary btn-sm"
            disabled={remove.isPending}
            onClick={() => void deleteOne(passkey.id)}
          >
            삭제
          </button>
        </div>
      ))}
      {passkeysSupported ? (
        <>
          <label className="field">
            <span className="field-label">패스키 이름</span>
            <input
              className="input"
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">현재 비밀번호</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!name.trim() || !password || register.isPending}
            onClick={() => void add()}
          >
            {register.isPending ? "등록 중…" : "이 기기에 패스키 등록"}
          </button>
        </>
      ) : (
        <p className="caption text-mute">
          이 브라우저는 패스키를 지원하지 않습니다.
        </p>
      )}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
