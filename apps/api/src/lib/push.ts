/** Expo Push API로 푸시 알림 발송. 실패해도 요청 처리에는 영향을 주지 않는다. */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** 토큰 하나에 대한 발송 결과 — 발송 로그(push_logs) 저장에 사용. */
export interface PushSendResult {
  token: string;
  status: "ok" | "error";
  /** 성공 시 Expo 티켓 id, 실패 시 오류 사유 */
  detail?: string;
}

function isExpoToken(t: string | null | undefined): t is string {
  return !!t && t.startsWith("ExponentPushToken");
}

/**
 * 유효한 Expo 토큰들에 푸시를 보내고, 토큰별 발송 결과를 반환한다.
 * (반환값은 push_logs에 발송 이력으로 남기기 위한 것이다.)
 */
export async function sendExpoPush(
  tokens: (string | null | undefined)[],
  message: PushMessage,
): Promise<PushSendResult[]> {
  const valid = tokens.filter(isExpoToken);
  if (valid.length === 0) return [];

  const results: PushSendResult[] = [];
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((to) => ({ to, sound: "default", ...message })),
        ),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("expo push failed", res.status, text);
        for (const to of chunk) {
          results.push({ token: to, status: "error", detail: `HTTP ${res.status}` });
        }
        continue;
      }
      // Expo는 입력 순서대로 티켓 배열을 돌려준다.
      const json = (await res.json()) as {
        data?: { status: string; id?: string; message?: string }[];
      };
      const tickets = json.data ?? [];
      chunk.forEach((to, idx) => {
        const ticket = tickets[idx];
        if (ticket && ticket.status === "ok") {
          results.push({ token: to, status: "ok", detail: ticket.id });
        } else {
          results.push({
            token: to,
            status: "error",
            detail: ticket?.message ?? "unknown",
          });
        }
      });
    } catch (err) {
      console.error("expo push error", err);
      for (const to of chunk) {
        results.push({ token: to, status: "error", detail: String(err) });
      }
    }
  }
  return results;
}
