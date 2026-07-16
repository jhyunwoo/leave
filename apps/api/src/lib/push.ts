/** Expo Push API로 푸시 알림 발송. 실패해도 요청 처리에는 영향을 주지 않는다. */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendExpoPush(
  tokens: (string | null | undefined)[],
  message: PushMessage,
): Promise<void> {
  const valid = tokens.filter(
    (t): t is string => !!t && t.startsWith("ExponentPushToken"),
  );
  if (valid.length === 0) return;

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
        console.error("expo push failed", res.status, await res.text());
      }
    } catch (err) {
      console.error("expo push error", err);
    }
  }
}
