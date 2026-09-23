import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { emailVerificationSchema } from "@leave/shared";
import { useSendEmailVerification, useVerifyEmail } from "../hooks/auth";
import { queryKeys } from "../query-keys";

/** 메일 버튼은 다른 탭·기기에서 인증을 끝낸다. 이 화면이 그걸 알아챌 간격. */
export const EMAIL_LINK_POLL_MS = 5_000;

/** 재발송 대기·입력·안내 문구를 두 플랫폼에서 일관되게 유지한다. */
export function useEmailVerification() {
  const sendMutation = useSendEmailVerification();
  const verifyMutation = useVerifyEmail();
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    // 웹은 창 포커스로 세션 쿼리를 다시 받지 않는다. 메일을 보낸 뒤에만 짧게 확인하고,
    // 인증되면 게이트가 이 화면을 내려 타이머도 함께 멈춘다.
    if (!sent) return;
    const timer = setInterval(
      () =>
        void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding }),
      EMAIL_LINK_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [sent, queryClient]);
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
        "인증 메일을 보냈어요. 메일의 버튼을 누르거나 10분 안에 코드를 입력해주세요. 메일이 없다면 스팸함도 확인해주세요.",
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
