/** WebAuthn/passkey의 플랫폼 공통 ceremony와 검증 규칙. */

import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { and, eq } from "drizzle-orm";
import { passkeyChallenges } from "../db/schema";
import type { Db } from "./db";

export const PASSKEY_RP_ID = "leave.moveto.kr";
export const PASSKEY_RP_NAME = "리브";
export const USER_PASSKEY_ORIGINS = [
  "https://leave.moveto.kr",
  "android:apk-key-hash:QJSMSnbdgzYupbmd72UotcUnitIZnS94RdT7q-qsZC4",
];
export const ADMIN_PASSKEY_ORIGINS = ["https://admin.leave.moveto.kr"];
export const MAX_PASSKEYS_PER_ACCOUNT = 10;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeySubjectKind = "user" | "admin";
export type PasskeyCeremony = "registration" | "authentication";

export type StoredPasskey = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transportsJson: string | null;
};

export function passkeyDto(row: {
  id: string;
  name: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function makeRegistrationOptions(args: {
  db: Db;
  subjectKind: PasskeySubjectKind;
  subjectId: string;
  userName: string;
  userDisplayName: string;
  name: string;
  existing: StoredPasskey[];
}) {
  const rpID = PASSKEY_RP_ID;
  const options = await generateRegistrationOptions({
    rpID,
    rpName: PASSKEY_RP_NAME,
    userID: new Uint8Array(new TextEncoder().encode(args.subjectId)),
    userName: args.userName,
    userDisplayName: args.userDisplayName,
    attestationType: "none",
    excludeCredentials: args.existing.map((credential) => ({
      id: credential.credentialId,
      transports: parseTransports(credential.transportsJson),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  const ceremonyId = await saveChallenge(args.db, {
    challenge: options.challenge,
    ceremony: "registration",
    subjectKind: args.subjectKind,
    subjectId: args.subjectId,
    name: args.name,
  });
  return { ceremonyId, options };
}

export async function makeAuthenticationOptions(
  db: Db,
  subjectKind: PasskeySubjectKind,
) {
  const options = await generateAuthenticationOptions({
    rpID: PASSKEY_RP_ID,
    userVerification: "required",
  });
  const ceremonyId = await saveChallenge(db, {
    challenge: options.challenge,
    ceremony: "authentication",
    subjectKind,
    subjectId: null,
    name: null,
  });
  return { ceremonyId, options };
}

export async function finishRegistration(args: {
  db: Db;
  ceremonyId: string;
  subjectKind: PasskeySubjectKind;
  subjectId: string;
  response: RegistrationResponseJSON;
  expectedOrigins: string[];
}) {
  const ceremony = await consumeChallenge(args.db, {
    id: args.ceremonyId,
    ceremony: "registration",
    subjectKind: args.subjectKind,
    subjectId: args.subjectId,
  });
  const verification = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: args.expectedOrigins,
    expectedRPID: PASSKEY_RP_ID,
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("패스키를 확인하지 못했습니다");
  const info = verification.registrationInfo;
  return {
    name: ceremony.name ?? "내 패스키",
    credentialId: info.credential.id,
    publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    transportsJson: info.credential.transports
      ? JSON.stringify(info.credential.transports)
      : null,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    aaguid: info.aaguid,
  };
}

export async function finishAuthentication(args: {
  db: Db;
  ceremonyId: string;
  subjectKind: PasskeySubjectKind;
  response: AuthenticationResponseJSON;
  credential: StoredPasskey;
  expectedOrigins: string[];
}) {
  const ceremony = await consumeChallenge(args.db, {
    id: args.ceremonyId,
    ceremony: "authentication",
    subjectKind: args.subjectKind,
    subjectId: null,
  });
  const verification = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: args.expectedOrigins,
    expectedRPID: PASSKEY_RP_ID,
    credential: {
      id: args.credential.credentialId,
      publicKey: isoBase64URL.toBuffer(args.credential.publicKey),
      counter: args.credential.counter,
      transports: parseTransports(args.credential.transportsJson),
    },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("패스키를 확인하지 못했습니다");
  return verification.authenticationInfo;
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as AuthenticatorTransportFuture[];
  } catch {
    return [];
  }
}

async function saveChallenge(
  db: Db,
  value: {
    challenge: string;
    ceremony: PasskeyCeremony;
    subjectKind: PasskeySubjectKind;
    subjectId: string | null;
    name: string | null;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(passkeyChallenges).values({
    id,
    ...value,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
  });
  return id;
}

async function consumeChallenge(
  db: Db,
  expected: {
    id: string;
    ceremony: PasskeyCeremony;
    subjectKind: PasskeySubjectKind;
    subjectId: string | null;
  },
) {
  const rows = await db
    .delete(passkeyChallenges)
    .where(
      and(
        eq(passkeyChallenges.id, expected.id),
        eq(passkeyChallenges.ceremony, expected.ceremony),
        eq(passkeyChallenges.subjectKind, expected.subjectKind),
      ),
    )
    .returning();
  const row = rows[0];
  if (
    !row ||
    row.subjectId !== expected.subjectId ||
    row.expiresAt <= new Date().toISOString()
  ) {
    throw new Error("패스키 요청이 만료되었거나 이미 사용되었습니다");
  }
  return row;
}
