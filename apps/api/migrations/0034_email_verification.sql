-- 이 마이그레이션 이전 계정만 인증 완료로 간주한다. 신규 행의 기본값은 NULL이다.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
UPDATE users SET email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE TABLE email_verifications (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  sent_at TEXT
);
