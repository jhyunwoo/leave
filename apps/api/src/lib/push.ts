/** Expo Push API로 푸시 알림 발송. 실패해도 요청 처리에는 영향을 주지 않는다. */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** 인앱 알림의 제목·본문을 표시하고, 열람에 필요한 알림 id만 data에 담는다. */
export function buildNotificationPushMessage(notification: {
  id: string;
  title: string;
  body: string;
}): PushMessage {
  return {
    title: notification.title,
    body: notification.body,
    data: { notificationId: notification.id },
  };
}

/** 토큰 하나에 대한 발송 결과 — 발송 로그(push_logs) 저장에 사용. */
export interface PushSendResult {
  token: string;
  status: "ok" | "error";
  /** 성공 시 Expo 티켓 id, 실패 시 오류 사유 */
  detail?: string;
}

export interface TokenPushMessage {
  token: string | null | undefined;
  message: PushMessage;
}

function isExpoToken(t: string | null | undefined): t is string {
  return !!t && t.startsWith("ExponentPushToken");
}

/**
 * Expo가 돌려주는 오류 문구에서 푸시 토큰을 지운다.
 *
 * Expo는 실패 사유에 토큰 원문을 그대로 넣어 준다
 * (`"ExponentPushToken[xxx]" is not a registered push token`). 그걸 그대로
 * console에 찍으면 기기 식별자가 Workers 로그로 새어 나간다 — push_logs에서
 * 토큰·제목·본문을 물리적으로 들어내고 status만 남긴 결정(마이그레이션 0012)과
 * 정면으로 어긋난다. 무엇이 잘못됐는지는 남기고 누구인지는 지운다.
 */
function redactPushTokens(text: string): string {
  return text.replace(/ExponentPushToken\[[^\]]*\]/g, "ExponentPushToken[…]");
}

/**
 * 유효한 Expo 토큰들에 푸시를 보내고, 토큰별 발송 결과를 반환한다.
 * (반환값은 push_logs에 발송 이력으로 남기기 위한 것이다.)
 */
export async function sendExpoPush(
  tokens: (string | null | undefined)[],
  message: PushMessage,
): Promise<PushSendResult[]> {
  return sendExpoPushMessages(tokens.map((token) => ({ token, message })));
}

/** 서로 다른 알림 payload를 토큰별로 지정하면서 Expo의 100건 배치를 유지한다. */
export async function sendExpoPushMessages(
  messages: TokenPushMessage[],
): Promise<PushSendResult[]> {
  const valid = messages.filter(
    (entry): entry is { token: string; message: PushMessage } =>
      isExpoToken(entry.token),
  );
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
          chunk.map((entry) => ({
            to: entry.token,
            sound: "default",
            ...entry.message,
          })),
        ),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("expo push failed", res.status, redactPushTokens(text));
        for (const entry of chunk) {
          results.push({
            token: entry.token,
            status: "error",
            detail: `HTTP ${res.status}`,
          });
        }
        continue;
      }
      // Expo는 입력 순서대로 티켓 배열을 돌려준다.
      const json: {
        data?: { status: string; id?: string; message?: string }[];
      } = await res.json();
      const tickets = json.data ?? [];
      chunk.forEach((entry, idx) => {
        const ticket = tickets[idx];
        if (ticket && ticket.status === "ok") {
          results.push({
            token: entry.token,
            status: "ok",
            detail: ticket.id,
          });
        } else {
          results.push({
            token: entry.token,
            status: "error",
            detail: ticket?.message ?? "unknown",
          });
        }
      });
    } catch (err) {
      console.error("expo push error", err);
      for (const entry of chunk) {
        results.push({
          token: entry.token,
          status: "error",
          detail: String(err),
        });
      }
    }
  }
  return results;
}
