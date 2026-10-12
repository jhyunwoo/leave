// 외부 캘린더 구독 링크와 피드.
//
// 피드 URL은 비밀번호와 같다. 여기서 지키는 것은 기능보다 **누가 무엇을 보는가**다 —
// 재발급한 옛 링크는 즉시 죽고, 같은 그룹 동료의 일정은 섞이지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUnit,
  isoDaysFromToday,
  openTestDb,
  req,
  signup,
  sleep,
} from "./helpers.mjs";

async function fetchFeed(url) {
  const res = await fetch(url);
  return { status: res.status, headers: res.headers, text: await res.text() };
}

async function enableFeed(token) {
  const res = await req("POST", "/calendar-feed", { token });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.url;
}

function leaveBody(title, startDate, endDate, extra = {}) {
  return {
    title,
    segments: [{ category: "annual", startDate, endDate }],
    ...extra,
  };
}

test("링크는 꺼진 채 시작하고, 켜기·재발급·끄기가 링크 수명을 정한다", async () => {
  const { token } = await signup();
  const initial = await req("GET", "/calendar-feed", { token });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.url, null);

  const first = await enableFeed(token);
  assert.match(first, /\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  assert.equal((await req("GET", "/calendar-feed", { token })).data.url, first);
  assert.equal((await fetchFeed(first)).status, 200);

  const second = await enableFeed(token);
  assert.notEqual(second, first);
  assert.equal(
    (await fetchFeed(first)).status,
    404,
    "재발급한 옛 링크는 즉시 죽는다",
  );
  assert.equal((await fetchFeed(second)).status, 200);

  const off = await req("DELETE", "/calendar-feed", { token });
  assert.equal(off.status, 200);
  assert.equal((await fetchFeed(second)).status, 404);
  assert.equal((await req("GET", "/calendar-feed", { token })).data.url, null);
});

test("링크 관리는 로그인이 필요하다", async () => {
  assert.equal((await req("GET", "/calendar-feed")).status, 401);
  assert.equal((await req("POST", "/calendar-feed")).status, 401);
  assert.equal((await req("GET", "/calendar-feed/items")).status, 401);
});

test("항목은 초안을 표시하고 반려·취소와 6개월보다 오래된 일정을 뺀다", async () => {
  const { token } = await signup();
  const soon = isoDaysFromToday(10);
  const old = isoDaysFromToday(-200);

  const draft = await req("POST", "/leaves", {
    token,
    body: leaveBody("초안 계획", soon, soon, { status: "draft" }),
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const cancelled = await req("POST", "/leaves", {
    token,
    body: leaveBody("취소될 계획", soon, soon),
  });
  const ancient = await req("POST", "/leaves", {
    token,
    body: leaveBody("오래된 휴가", old, old),
  });
  assert.equal(ancient.status, 201, JSON.stringify(ancient.data));
  // 사용자가 직접 고를 수 없는 종료 상태라 DB에서 바꾼다.
  const db = openTestDb();
  try {
    db.prepare("UPDATE leaves SET status = 'cancelled' WHERE id = ?").run(
      cancelled.data.leave.id,
    );
  } finally {
    db.close();
  }

  const items = await req("GET", "/calendar-feed/items", { token });
  assert.equal(items.status, 200);
  assert.deepEqual(
    items.data.items.map((item) => item.title),
    ["(초안) [휴가] 초안 계획"],
  );
});

test("피드는 iCalendar로, 내 휴가·개인 일정과 소속 그룹 일정만 담는다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { name: "피드중대" });
  const unitId = created.data.unit.id;
  const peer = await signup();
  // 동료 일정이 만들어지지 않았다면 아래의 "동료 것은 없다" 단언이 아무것도 증명하지 못한다.
  const joined = await req("POST", "/units/join", {
    token: peer.token,
    body: { code: created.data.invite.code },
  });
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  const day = isoDaysFromToday(20);

  await req("POST", "/leaves", {
    token: owner.token,
    body: leaveBody("내 휴가", day, day),
  });
  const peerLeave = await req("POST", "/leaves", {
    token: peer.token,
    body: leaveBody("동료 휴가", day, day),
  });
  assert.equal(peerLeave.status, 201, JSON.stringify(peerLeave.data));
  const peerEvent = await req("POST", "/personal-events", {
    token: peer.token,
    body: { title: "동료 개인", startDate: day, endDate: day },
  });
  assert.equal(peerEvent.status, 201, JSON.stringify(peerEvent.data));
  await req("POST", "/personal-events", {
    token: owner.token,
    body: {
      title: "내 개인",
      startDate: day,
      endDate: day,
      startTime: "09:30",
      endTime: "11:00",
      note: "메모, 쉼표",
    },
  });
  const event = await req("POST", `/units/${unitId}/events`, {
    token: owner.token,
    body: { title: "체육대회", isHoliday: false, startDate: day, endDate: day },
  });
  assert.equal(event.status, 201, JSON.stringify(event.data));

  const url = await enableFeed(owner.token);
  const feed = await fetchFeed(url);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type"), /^text\/calendar/);
  assert.match(feed.headers.get("cache-control"), /private/);
  const text = feed.text.replaceAll("\r\n ", "");
  assert.ok(text.includes("SUMMARY:[휴가] 내 휴가\r\n"));
  assert.ok(text.includes("SUMMARY:내 개인\r\n"));
  assert.ok(text.includes("DESCRIPTION:메모\\, 쉼표\r\n"));
  assert.ok(text.includes("SUMMARY:[피드중대] 체육대회\r\n"));
  assert.ok(!text.includes("동료"), "같은 그룹 동료의 일정은 섞이지 않는다");

  // 그룹을 나가면 부대 일정이 빠진다(관리자는 이관 후에만 나갈 수 있다).
  await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: peer.data.user.id },
  });
  assert.equal(
    (await req("POST", "/units/leave", { token: owner.token })).status,
    200,
  );
  assert.ok(!(await fetchFeed(url)).text.includes("체육대회"));
});

test("모르는 토큰과 .ics가 아닌 경로는 404", async () => {
  const base = process.env.API_URL ?? "http://localhost:8799";
  assert.equal(
    (await fetchFeed(`${base}/calendar/${"x".repeat(43)}.ics`)).status,
    404,
  );
  assert.equal((await fetchFeed(`${base}/calendar/abc`)).status, 404);
});

test("피드 rate limit은 IP가 아니라 피드 주인 단위다", async () => {
  // 구글은 모든 사용자의 피드를 같은 IP 대역에서 받아 간다. 테스트도 한 IP에서 돈다.
  const a = await enableFeed((await signup()).token);
  const b = await enableFeed((await signup()).token);
  const headers = { "CF-Connecting-IP": "203.0.113.7" };
  let lastA = 0;
  for (let i = 0; i < 61; i += 1) {
    lastA = (await fetch(a, { headers })).status;
  }
  assert.equal(lastA, 429, "한 피드를 10분에 61번 받으면 막힌다");
  assert.equal(
    (await fetch(b, { headers })).status,
    200,
    "다른 사용자의 피드는 막히지 않는다",
  );
});

test("접속 기록에는 피드 토큰이 남지 않는다", async () => {
  const url = await enableFeed((await signup()).token);
  await fetchFeed(url);
  // 대소문자만 바꾼 경로도 같은 마스킹을 받는다(아래 LIKE는 ASCII에서 대소문자를 가리지 않는다).
  const base = process.env.API_URL ?? "http://localhost:8799";
  await fetchFeed(`${base}/Calendar/${"x".repeat(43)}.ics`);
  await sleep(800);
  const db = openTestDb();
  try {
    const rows = db
      .prepare("SELECT path FROM access_logs WHERE path LIKE '/calendar/%'")
      .all();
    assert.ok(rows.length > 0);
    for (const row of rows) assert.equal(row.path, "/calendar/:token");
  } finally {
    db.close();
  }
});
