// 스토어용 웹 데스크탑 캡처를 찍기 위한 **로컬 전용** 데모 데이터 시딩.
//
// 아이패드 슬라이드는 실제 웹 화면을 캡처해 만든다. 그런데 빈 계정으로는 달력이
// 텅 비어 광고로 쓸 수 없으므로, 로컬 API(localhost:8787)에 가상의 그룹과 구성원,
// 휴가를 넣어 화면을 채운다.
//
// 반드시 지킬 것 (store/README.md 제출 원칙):
//   - 실제 부대명·실명·군번·계급·작전/훈련/병력 정보를 절대 넣지 않는다.
//   - 그룹 이름은 누가 봐도 가상인 이름을 쓴다.
//   - 계정 이메일은 화면에 노출돼도 무해한 example 도메인을 쓴다.
//
// 선행 조건:
//   pnpm --filter @leave/api db:migrate:local
//   pnpm --filter @leave/api exec wrangler dev --port 8787 \
//     --var CORS_ORIGIN:http://localhost:5173 \
//     --var 'RATE_LIMITS:{"signup":100000,"login":100000}'
//
// RATE_LIMITS 덮어쓰기가 없으면 한 IP에서 계정을 여러 개 만드는 순간 429로 막힌다
// (apps/api/src/middleware/rate-limit.ts).
//
// 실행: node seed-web.mjs   → 주 계정의 세션 토큰과 unitId를 stdout(JSON)으로 출력

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.SEED_API_URL || "http://localhost:8787";

/**
 * 이 스크립트가 만드는 계정은 전부 **같은 비밀번호**를 쓴다. 캡처용 로컬 데이터라
 * 그래도 되지만, 그 전제가 깨지는 순간 "누구나 아는 비밀번호를 가진 계정"이
 * 실제 서비스에 생긴다. 그래서 대상이 루프백이 아니면 아예 시작하지 않는다.
 *
 * 파일 첫머리에 적힌 "로컬 전용"은 지금까지 주석일 뿐이었다 — `SEED_API_URL`에
 * 아무 주소나 넣으면 그대로 따라갔다. 정말 원격에 넣어야 한다면
 * `SEED_ALLOW_REMOTE=1`을 함께 지정해 스스로 그 선택을 밝히게 한다.
 */
function assertLocalTarget(url) {
  if (process.env.SEED_ALLOW_REMOTE === "1") return;
  const { hostname } = new URL(url);
  const loopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
  if (!loopback) {
    throw new Error(
      `이 스크립트는 로컬 전용입니다. 데모 계정은 모두 같은 비밀번호를 쓰므로 ` +
        `${hostname}에는 넣지 않습니다. 정말 필요하면 SEED_ALLOW_REMOTE=1을 함께 지정하세요.`,
    );
  }
}

assertLocalTarget(API);

const PASSWORD = "leave-demo-1234";
/** 캡처 결과를 재현할 수 있도록 기준 월을 고정한다. 바꾸면 캡처도 다시 찍어야 한다. */
export const BASE_MONTH = process.env.SEED_MONTH || "2026-08";
/** 정기외박 주기 시작일. 기준월까지 적립이 여러 번 쌓이도록 충분히 앞에 둔다. */
const OVERNIGHT_START = "2026-04-01";
/** 정기외박 자동 적립을 설정할 수 있는 군 종류. */
const HAS_OVERNIGHT = new Set(["navy", "air_force"]);

const OUT_FILE = path.join(__dirname, ".seed-session.json");

function day(n) {
  return `${BASE_MONTH}-${String(n).padStart(2, "0")}`;
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${pathname} → ${res.status} ${text.slice(0, 400)}`,
    );
  }
  return json;
}

/** 가입 → 온보딩 3단계 → 완료. 반환: 세션 토큰. */
async function createUser({
  email,
  name,
  branch,
  rank,
  enlistedAt,
  dischargeAt,
  overnight,
}) {
  const signup = await api("/auth/signup", {
    method: "POST",
    body: { email, password: PASSWORD, dataConsent: true },
  });
  const token = signup.token;
  await api("/auth/onboarding/profile", {
    method: "PUT",
    token,
    body: { name, branch, enlistedAt, dischargeAt, rank },
  });
  await api("/auth/onboarding/regular-overnight", {
    method: "PUT",
    token,
    body: overnight ?? { enabled: false },
  });
  await api("/auth/onboarding/complete", { method: "POST", token });
  return token;
}

// ── 가상 인물 ──────────────────────────────────────────────────
// 이름은 실명이 아니라 별칭체다. 웹 온보딩도 "별칭"을 받는다(schemas.ts).
const MEMBERS = [
  {
    name: "푸른고래",
    branch: "air_force",
    rank: "corporal",
    enlistedAt: "2025-11-03",
    dischargeAt: "2027-06-02",
  },
  {
    name: "새벽하늘",
    branch: "army",
    rank: "sergeant",
    enlistedAt: "2025-06-16",
    dischargeAt: "2026-12-15",
  },
  {
    name: "밤바다",
    branch: "navy",
    rank: "corporal",
    enlistedAt: "2025-09-01",
    dischargeAt: "2027-05-31",
  },
  {
    name: "구름따라",
    branch: "army",
    rank: "private_first",
    enlistedAt: "2026-02-09",
    dischargeAt: "2027-08-08",
  },
  {
    name: "노을진",
    branch: "air_force",
    rank: "sergeant",
    enlistedAt: "2025-04-07",
    dischargeAt: "2026-11-06",
  },
  {
    name: "산들바람",
    branch: "army",
    rank: "corporal",
    enlistedAt: "2025-12-15",
    dischargeAt: "2027-06-14",
  },
  {
    name: "돌담길",
    branch: "navy",
    rank: "private_first",
    enlistedAt: "2026-01-19",
    dischargeAt: "2027-09-18",
  },
  {
    name: "고요한밤",
    branch: "army",
    rank: "corporal",
    enlistedAt: "2025-10-13",
    dischargeAt: "2027-04-12",
  },
];

// 하루 최대 출타 4명 기준으로, 며칠은 여유롭고 22일은 넘치고(초과) 27일은 꽉 차도록
// (임박) 배치한다 — 달력의 혼잡 신호와 초과 표시가 실제로 보여야 광고가 된다.
//
// 주의: 그룹의 returnDayCounts=false라 **복귀일(마지막 날)은 그날 인원에 세지 않는다**.
// 22일을 초과로 만들려면 22일에 끝나는 휴가가 아니라 22일을 지나가는 휴가여야 한다.
//
// 인덱스는 MEMBERS 기준(0번이 주 계정). 정기외박은 해군·공군에게만 준다.
const overnight = (startDate, endDate) => [
  { category: "overnight", overnightKind: "regular", startDate, endDate },
];
const annual = (startDate, endDate) => [
  { category: "annual", startDate, endDate },
];

const LEAVES = [
  { who: 0, title: "정기외박", segments: overnight(day(14), day(16)) },
  { who: 0, title: "연가", segments: annual(day(23), day(24)) },
  { who: 1, title: "연가", segments: annual(day(21), day(24)) },
  { who: 1, title: "연가", segments: annual(day(6), day(7)) },
  { who: 2, title: "정기외박", segments: overnight(day(22), day(23)) },
  { who: 2, title: "연가", segments: annual(day(26), day(28)) },
  { who: 3, title: "연가", segments: annual(day(20), day(23)) },
  { who: 3, title: "연가", segments: annual(day(13), day(14)) },
  { who: 4, title: "정기외박", segments: overnight(day(7), day(9)) },
  { who: 4, title: "연가", segments: annual(day(27), day(29)) },
  { who: 5, title: "연가", segments: annual(day(22), day(25)) },
  { who: 5, title: "연가", segments: annual(day(6), day(8)) },
  { who: 6, title: "정기외박", segments: overnight(day(27), day(28)) },
  { who: 6, title: "연가", segments: annual(day(21), day(23)) },
  { who: 7, title: "연가", segments: annual(day(4), day(6)) },
  { who: 7, title: "연가", segments: annual(day(27), day(28)) },
];

// 주 계정의 적립분 — 재원별 잔여와 만기 자동 차감을 보여주는 데이터.
const GRANTS = [
  {
    balanceKey: "annual",
    days: 12,
    grantedOn: "2026-01-02",
    expiresOn: "2026-12-31",
    note: "2026년 연가",
  },
  {
    balanceKey: "award",
    days: 6,
    grantedOn: "2026-03-11",
    expiresOn: "2026-09-30",
    note: "체력 검정 우수",
  },
  {
    balanceKey: "award",
    days: 4,
    grantedOn: "2026-06-22",
    expiresOn: "2027-06-21",
    note: "분기 표창",
  },
  {
    balanceKey: "consolation",
    days: 4,
    grantedOn: "2026-05-08",
    expiresOn: "2026-11-07",
  },
  {
    balanceKey: "petition",
    days: 3,
    grantedOn: "2026-07-01",
    expiresOn: "2027-06-30",
  },
  {
    balanceKey: "compensation",
    days: 2,
    grantedOn: "2026-04-19",
    expiresOn: "2026-10-18",
  },
];

async function run() {
  console.log(`API=${API} 기준월=${BASE_MONTH}`);
  const stamp = Date.now().toString(36);
  const tokens = [];

  for (const [i, m] of MEMBERS.entries()) {
    const token = await createUser({
      ...m,
      email: `demo-${stamp}-${String(i + 1).padStart(2, "0")}@leave.example`,
      // 정기외박 자동 적립은 해군·공군만 설정할 수 있다(API 검증). 이 주기가 곧
      // 정기외박 적립분이라, 켜두지 않으면 아래 LEAVES의 외박 등록이
      // "쓸 수 있는 적립분이 없어요"로 막힌다. 시작일은 기준월보다 넉넉히 앞에 둔다.
      overnight: HAS_OVERNIGHT.has(m.branch)
        ? {
            enabled: true,
            startDate: OVERNIGHT_START,
            intervalDays: 21,
            daysPerGrant: 4,
          }
        : { enabled: false },
    });
    tokens.push(token);
    console.log(`  · 계정 ${i + 1}/${MEMBERS.length} ${m.name}`);
  }

  // 주 계정이 그룹을 만들고, 나머지가 초대코드로 들어온다.
  const created = await api("/units", {
    method: "POST",
    token: tokens[0],
    body: {
      name: "제7가상대대 데모",
      description: "스토어 스크린샷용 가상 그룹입니다. 실제 부대와 무관합니다.",
      maxLeaveCount: 4,
      referenceMemberTotal: 20,
      returnDayCounts: false,
    },
  });
  const unitId = created.unit.id;
  const code = created.invite.code;
  console.log(`  · 그룹 생성 ${created.unit.name} (${unitId})`);

  for (let i = 1; i < tokens.length; i += 1) {
    await api("/units/join", {
      method: "POST",
      token: tokens[i],
      body: { code },
    });
  }
  console.log(`  · ${tokens.length - 1}명 가입 완료`);

  for (const g of GRANTS) {
    await api("/leaves/grants", { method: "POST", token: tokens[0], body: g });
  }
  console.log(`  · 적립분 ${GRANTS.length}건`);

  for (const l of LEAVES) {
    await api("/leaves", {
      method: "POST",
      token: tokens[l.who],
      body: { title: l.title, segments: l.segments },
    });
  }
  console.log(`  · 휴가 ${LEAVES.length}건`);

  const session = { token: tokens[0], unitId, month: BASE_MONTH, api: API };
  fs.writeFileSync(OUT_FILE, JSON.stringify(session, null, 2) + "\n");
  console.log(
    `\n완료. 세션을 ${path.relative(process.cwd(), OUT_FILE)} 에 저장했습니다.`,
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
