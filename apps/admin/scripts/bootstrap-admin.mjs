import { randomBytes, webcrypto } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PBKDF2_ITERATIONS = 100_000;
const DEFAULT_EMAIL = "jhyunwoo0228@gmail.com";
const local = process.argv.includes("--local");
const persistIndex = process.argv.indexOf("--persist-to");
const persistTo =
  persistIndex >= 0 && process.argv[persistIndex + 1]
    ? process.argv[persistIndex + 1]
    : null;

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, saltHex) {
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)?.map((hex) => Number.parseInt(hex, 16)) ?? [],
  );
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

const email = (process.env.ADMIN_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
const name = (process.env.ADMIN_NAME ?? "시스템 관리자").trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_EMAIL이 올바른 이메일 형식이 아닙니다.");
}
if (!name) throw new Error("ADMIN_NAME은 비어 있을 수 없습니다.");

const temporaryPassword =
  process.env.ADMIN_PASSWORD ?? `L!${randomBytes(18).toString("base64url")}`;
if (temporaryPassword.length < 12) {
  throw new Error("ADMIN_PASSWORD는 12자 이상이어야 합니다.");
}
const salt = randomBytes(16).toString("hex");
const hash = await hashPassword(temporaryPassword, salt);
const now = new Date().toISOString();
const id = webcrypto.randomUUID();

const sql = `
INSERT INTO admin_accounts (
  id, email, name, role, password_hash, password_salt,
  must_change_password, active, created_at, updated_at
) VALUES (
  ${sqlString(id)}, ${sqlString(email)}, ${sqlString(name)}, 'owner',
  ${sqlString(hash)}, ${sqlString(salt)}, 1, 1, ${sqlString(now)}, ${sqlString(now)}
)
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  role = 'owner',
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  must_change_password = 1,
  active = 1,
  updated_at = excluded.updated_at;
DELETE FROM admin_sessions
WHERE admin_id = (SELECT id FROM admin_accounts WHERE email = ${sqlString(email)});
`;

const directory = await mkdtemp(path.join(tmpdir(), "leave-admin-bootstrap-"));
const file = path.join(directory, "bootstrap.sql");
try {
  await writeFile(file, sql, { mode: 0o600 });
  const wranglerArgs = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "leave-db",
    local ? "--local" : "--remote",
    ...(persistTo ? ["--persist-to", persistTo] : []),
    "--file",
    file,
  ];
  const result = spawnSync("pnpm", wranglerArgs, {
    stdio: "inherit",
    cwd: path.resolve(import.meta.dirname, ".."),
  });
  if (result.status !== 0) {
    throw new Error("최초 관리자 D1 시드에 실패했습니다.");
  }
  process.stdout.write(
    [
      "",
      `${local ? "로컬" : "원격"} owner 계정이 준비되었습니다.`,
      `이메일: ${email}`,
      `임시 비밀번호: ${temporaryPassword}`,
      "이 비밀번호는 다시 표시되지 않습니다. 첫 로그인에서 즉시 변경하세요.",
      "",
    ].join("\n"),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
