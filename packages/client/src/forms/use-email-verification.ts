import { useEffect, useState } from "react";
import { emailVerificationSchema } from "@leave/shared";
import { useSendEmailVerification, useVerifyEmail } from "../hooks/auth";

/** 재발송 대기·입력·안내 문구를 두 플랫폼에서 일관되게 유지한다. */
export function useEmailVerification() {
  const sendMutation = useSendEmailVerification();
  const verifyMutation = useVerifyEmail();
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [remaining]);
  const busy = sendMutation.isPending || verifyMutation.isPending;
  const send = async () => {
    if (busy || remaining > 0) return;
    setError(null);
    setMessage(null);
    try {
      await sendMutation.mutateAsync();
      setSent(true);
      setCode("");
      setMessage(
        "인증 코드를 보냈어요. 10분 안에 입력해주세요. 메일이 없다면 스팸함도 확인해주세요.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "메일을 보내지 못했어요",
      );
    } finally {
      setRemaining(60);
    }
  };
  const verify = async () => {
    if (busy) return;
    const parsed = emailVerificationSchema.safeParse({ code });
    if (!parsed.success) {
      setError("6자리 인증 코드를 입력해주세요");
      return;
    }
    setError(null);
    try {
      await verifyMutation.mutateAsync(parsed.data.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "인증하지 못했어요");
    }
  };
  return {
    code,
    setCode,
    error,
    message,
    remaining,
    busy,
    sent,
    send,
    verify,
    canVerify: /^[0-9]{6}$/.test(code) && !busy,
  };
}
