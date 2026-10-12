// 외부 캘린더 구독 링크와 피드.
//
// 피드 URL은 비밀번호와 같다. 여기서 지키는 것은 기능보다 **누가 무엇을 보는가**다 —
// 재발급한 옛 링크는 즉시 죽고, 같은 그룹 동료의 일정은 섞이지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDaysFromToday, openTestDb, req, signup } from "./helpers.mjs";

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
