import { and, eq, gt, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { emailVerifications, users, type UserRow } from "../db/schema";
import type { AppBindings } from "./app";
import type { Db } from "./db";
import { verificationEmail } from "./verification-email";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function newCode(): string {
  // 나머지만 취하면 숫자별 확률이 달라지므로 끝의 불완전한 구간은 버린다.
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0]! >= 4_294_000_000);
  return String(value[0]! % 1_000_000).padStart(6, "0");
}

async function codeDigest(
  secret: string,
  userId: string,
  id: string,
  code: string,
) {
  // 6자리 코드는 전수 대입할 수 있으므로 DB 유출만으로 대조할 수 없게 HMAC을 쓴다.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${userId}:${id}:${code}`),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function digestsMatch(a: string, b: string) {
  // 응답 시간으로 저장된 해시를 한 글자씩 맞혀 가지 못하게 끝까지 비교한다.
  // 길이는 비밀이 아니다(항상 64자, 발송 실패로 무효화된 코드만 빈 문자열).
  // Workers의 crypto.subtle.timingSafeEqual은 웹·앱 타입 검사(DOM lib)에 없어 직접 비교한다.
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function sendEmailVerification(
  db: Db,
  env: AppBindings,
  user: UserRow,
) {
  if (user.emailVerifiedAt) return "already_verified" as const;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.EMAIL_CODE_SECRET)
    return "unavailable" as const;
  const now = new Date();
  const id = crypto.randomUUID();
  const code = newCode();
  const challenge = {
    userId: user.id,
    id,
    codeHash: await codeDigest(env.EMAIL_CODE_SECRET, user.id, id, code),
    attempts: 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    sentAt: null,
  };
  // 발송 전에 원자적으로 자리를 잡는다. 중복 클릭·다른 기기의 동시 요청도 한 번만 보낸다.
  const [reserved] = await db
    .insert(emailVerifications)
    .values(challenge)
    .onConflictDoUpdate({
      target: emailVerifications.userId,
      set: challenge,
      setWhere: lte(
        emailVerifications.createdAt,
        new Date(now.getTime() - RESEND_DELAY_MS).toISOString(),
      ),
    })
    .returning({ id: emailVerifications.id });
  if (!reserved) return "rate_limited" as const;
  const { subject, text, html } = verificationEmail(code);
  try {
    const response = await fetch(
      `${env.RESEND_API_URL ?? "https://api.resend.com"}/emails`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `verify-email/${id}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [user.email],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("Email delivery failed");
    await db
      .update(emailVerifications)
      .set({ sentAt: new Date().toISOString() })
      .where(
        and(
          eq(emailVerifications.userId, user.id),
          eq(emailVerifications.id, id),
        ),
      );
    return "sent" as const;
  } catch {
    // 제공자 응답에는 계정·인프라 정보가 섞일 수 있어 로그/클라이언트에 내보내지 않는다.
    // 실패한 발송도 60초 제한을 유지하되 코드는 쓸 수 없게 한다.
    await db
      .update(emailVerifications)
      .set({ codeHash: "", sentAt: null })
      .where(
        and(
          eq(emailVerifications.userId, user.id),
          eq(emailVerifications.id, id),
        ),
      );
    return "unavailable" as const;
  }
}

export async function verifyEmailCode(
  db: Db,
  env: AppBindings,
  user: UserRow,
  code: string,
) {
  if (user.emailVerifiedAt || !env.EMAIL_CODE_SECRET) return false;
  const now = new Date().toISOString();
  // 오답을 포함한 모든 시도를 원자적으로 센다. 병렬 요청으로 상한을 넘길 수 없다.
  const [challenge] = await db
    .update(emailVerifications)
    .set({ attempts: sql`${emailVerifications.attempts} + 1` })
    .where(
      and(
        eq(emailVerifications.userId, user.id),
        gt(emailVerifications.expiresAt, now),
        isNotNull(emailVerifications.sentAt),
        lt(emailVerifications.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!challenge) return false;
  const digest = await codeDigest(
    env.EMAIL_CODE_SECRET,
    user.id,
    challenge.id,
    code,
  );
  if (!digestsMatch(digest, challenge.codeHash)) return false;
  // 인증 상태 변경과 코드 소비를 한 트랜잭션으로 묶고 최신 challenge를 다시 확인한다.
  const [verified] = await db.batch([
    db
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(
        and(
          eq(users.id, user.id),
          isNull(users.emailVerifiedAt),
          sql`exists (select 1 from ${emailVerifications} where ${emailVerifications.userId} = ${user.id}
        and ${emailVerifications.id} = ${challenge.id} and ${emailVerifications.codeHash} = ${digest}
        and ${emailVerifications.expiresAt} > ${now} and ${emailVerifications.attempts} <= ${MAX_ATTEMPTS}
        and ${emailVerifications.sentAt} is not null)`,
        ),
      )
      .returning({ id: users.id }),
    db
      .delete(emailVerifications)
      .where(
        and(
          eq(emailVerifications.userId, user.id),
          eq(emailVerifications.id, challenge.id),
        ),
      ),
  ]);
  return verified.length === 1;
}
