/**
 * 전체 공지 — 운영 공지를 끄지 않은 모든 사용자에게 인앱 알림과 푸시를 보낸다.
 *
 * owner 전용(AdminOnly + 서버의 ownerMiddleware). 실수 한 번이 모든 사용자에게
 * 가므로, 보내기 전에 받는 사람 수를 보여주고 확인 문구를 직접 입력하게 한다.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Megaphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError, type AdminAccount } from "../api/client";
import { AdminOnly } from "../components/AppShell";
import { ConfirmDialog, useToast } from "../components/ui";

type Preview = { recipients: number; pushTargets: number };
type Summary = { recipients: number; pushed: number; pushFailed: number };

const CONFIRMATION_TEXT = "전체 발송";

export function BroadcastPage({ admin }: { admin: AdminAccount }) {
  return (
    <AdminOnly admin={admin}>
      <BroadcastForm />
    </AdminOnly>
  );
}

function BroadcastForm() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const preview = useQuery({
    queryKey: ["broadcast-preview"],
    queryFn: () => api.get<Preview>("/notifications/broadcast"),
  });

  const send = useMutation({
    mutationFn: () =>
      api.post<Summary>("/notifications/broadcast", { title, body }),
    onSuccess: (summary) => {
      setConfirmOpen(false);
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["entities"] });
      toast.success(
        `${summary.recipients}명에게 보냈습니다 (푸시 성공 ${summary.pushed}, 실패 ${summary.pushFailed})`,
      );
    },
    onError: (caught) => {
      setConfirmOpen(false);
      setError(
        caught instanceof ApiError ? caught.message : "보내지 못했습니다",
      );
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    // 확인 창의 숫자가 방금 바뀐 수신 설정까지 반영하도록 다시 센다.
    void preview.refetch();
    setConfirmOpen(true);
  };

  const counts = preview.data
    ? `받는 사람 ${preview.data.recipients}명 · 그중 푸시 ${preview.data.pushTargets}명`
    : "받는 사람 수를 세는 중";

  return (
    <section className="settings-card password-card">
      <div className="settings-card-icon">
        <Megaphone size={24} />
      </div>
      <div>
        <h2>전체 공지</h2>
        <p>
          운영 공지를 끄지 않은 모든 사용자의 알림함에 남기고, 기기 알림을 켠
          사용자에게는 푸시도 보냅니다. 보낸 뒤에는 되돌릴 수 없습니다. 홍보성
          내용은 보내지 마세요. 사전 동의가 필요합니다.
        </p>
        <p>{counts}</p>
      </div>
      <form onSubmit={submit} className="form-grid single">
        <label className="field">
          <span>제목</span>
          <input
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>내용</span>
          <textarea
            value={body}
            maxLength={500}
            rows={5}
            onChange={(event) => setBody(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            className="button primary"
            type="submit"
            disabled={send.isPending || !title.trim() || !body.trim()}
          >
            {send.isPending ? (
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
            ) : (
              <Megaphone size={17} aria-hidden="true" />
            )}
            전체 발송
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="전체 공지를 보낼까요?"
        description={`${counts}. 보낸 뒤에는 되돌릴 수 없습니다.`}
        confirmLabel="보내기"
        confirmationText={CONFIRMATION_TEXT}
        pending={send.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => send.mutate()}
      />
    </section>
  );
}
