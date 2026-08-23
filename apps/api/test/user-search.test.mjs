import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, setUsername, signup, uniq } from "./helpers.mjs";

function search(viewer, query) {
  return req("GET", `/users/search?q=${encodeURIComponent(query)}`, {
    token: viewer.token,
  });
}

function profile(viewer, username) {
  return req("GET", `/users/${encodeURIComponent(username)}`, {
    token: viewer.token,
  });
}

function usernames(response) {
  return response.data.results.map((row) => row.username);
}

test("검색은 정확 일치를 먼저 주고 접두어를 잇는다", async () => {
  const tag = uniq("");
  const viewer = await signup({ name: "조회자" });
  // 정확 일치 대상과, 그 이름으로 시작하는 이웃들.
  const exact = await signup({ name: "정확", username: `seek${tag}` });
  const longer = await signup({ name: "더김", username: `seek${tag}.jr` });
  const other = await signup({ name: "다른", username: `seek${tag}zzz` });
  const unrelated = await signup({ name: "무관", username: `other${tag}` });

  const hit = await search(viewer, `seek${tag}`);
  assert.equal(hit.status, 200, JSON.stringify(hit.data));
  const found = usernames(hit);
  assert.equal(found[0], exact.username, "정확 일치가 첫 줄");
  assert.ok(found.includes(longer.username));
  assert.ok(found.includes(other.username));
  assert.ok(!found.includes(unrelated.username));

  // @는 붙여도 되고, 대문자로 쳐도 같은 결과가 나온다.
  assert.deepEqual(usernames(await search(viewer, `@seek${tag}`)), found);
  assert.deepEqual(
    usernames(await search(viewer, `SEEK${tag.toUpperCase()}`)),
    found,
  );

  // `_`는 이름에 쓸 수 있는 문자다 — LIKE 와일드카드로 새어 나가면 안 된다.
  const underscore = await signup({ name: "밑줄", username: `bar${tag}_x` });
  const sibling = await signup({ name: "형제", username: `bar${tag}yx` });
  const underscoreHit = usernames(await search(viewer, `bar${tag}_`));
  assert.ok(underscoreHit.includes(underscore.username));
  assert.ok(
    !underscoreHit.includes(sibling.username),
    "밑줄이 아무 글자나 매치하면 안 된다",
  );
});

test("한글 이름도 검색된다", async () => {
  const tag = uniq("");
  const viewer = await signup();
  const korean = await signup({ name: "한글이", username: `현우${tag}` });
  const koreanPrefix = await signup({
    name: "한글이2",
    username: `현우${tag}_24`,
  });

  const hit = await search(viewer, `현우${tag}`);
  assert.equal(hit.status, 200);
  assert.equal(usernames(hit)[0], korean.username);
  assert.ok(usernames(hit).includes(koreanPrefix.username));
});

test("검색 결과는 관계 상태를 함께 주고 20건을 넘지 않는다", async () => {
  const tag = uniq("");
  const viewer = await signup({ name: "관계" });
  const stranger = await signup({ username: `rel${tag}a` });
  const requested = await signup({ username: `rel${tag}b` });
  const requesting = await signup({ username: `rel${tag}c` });
  const friend = await signup({ username: `rel${tag}d` });

  const ask = (from, to) =>
    req("POST", "/friends/requests", {
      token: from.token,
      body: { username: to.username },
    });
  const accept = (who, from) =>
    req("POST", `/friends/requests/${from.data.user.id}/accept`, {
      token: who.token,
    });

  assert.equal((await ask(viewer, requested)).status, 200);
  assert.equal((await ask(requesting, viewer)).status, 200);
  assert.equal((await ask(viewer, friend)).status, 200);
  assert.equal((await accept(friend, viewer)).status, 200);

  const rows = (await search(viewer, `rel${tag}`)).data.results;
  const byId = new Map(rows.map((row) => [row.userId, row.relationship]));
  assert.equal(byId.get(stranger.data.user.id), "none");
  assert.equal(byId.get(requested.data.user.id), "outgoing");
  assert.equal(byId.get(requesting.data.user.id), "incoming");
  assert.equal(byId.get(friend.data.user.id), "friends");

  // 자기 자신은 self로 온다.
  const mine = await search(viewer, viewer.username);
  assert.equal(mine.data.results[0].relationship, "self");

  // 결과 수 상한.
  const bulkTag = uniq("");
  for (let i = 0; i < 22; i += 1) {
    await signup({
      username: `bulk${bulkTag}${i.toString().padStart(2, "0")}`,
    });
  }
  const bulk = await search(viewer, `bulk${bulkTag}`);
  assert.equal(bulk.data.results.length, 20);
});

test("검색·프로필 응답에 비공개 정보가 실리지 않는다", async () => {
  const viewer = await signup();
  const target = await signup({
    name: "대상",
    branch: "air_force",
    enlistedAt: "2026-03-23",
    dischargeAt: "2027-12-22",
  });
  await createUnit(target.token);
  await req("POST", "/leaves", {
    token: target.token,
    body: {
      title: "노출되면 안 되는 제목",
      reason: "노출되면 안 되는 사유",
      status: "shared",
      segments: [
        { category: "annual", startDate: "2026-07-01", endDate: "2026-07-02" },
      ],
    },
  });
  await req("POST", "/personal-events", {
    token: target.token,
    body: {
      title: "비밀 개인 일정",
      startDate: "2026-07-01",
      endDate: "2026-07-01",
    },
  });

  const found = await profile(viewer, target.username);
  assert.equal(found.status, 200);
  assert.deepEqual(Object.keys(found.data).sort(), [
    "name",
    "relationship",
    "userId",
    "username",
  ]);

  const body =
    JSON.stringify(found.data) +
    JSON.stringify(await search(viewer, target.username));
  for (const secret of [
    target.email,
    "air_force",
    "2026-03-23",
    "2027-12-22",
    "노출되면 안 되는 제목",
    "노출되면 안 되는 사유",
    "비밀 개인 일정",
    "unitId",
    "rank",
  ]) {
    assert.ok(!body.includes(secret), `${secret} 가 새면 안 된다`);
  }
  assert.equal(found.headers["cache-control"], "no-store");
});

test("프로필은 정규화된 이름으로 열리고, 이름을 바꾸면 옛 주소가 닫힌다", async () => {
  const tag = uniq("");
  const viewer = await signup({ name: "보는이" });
  const target = await signup({ name: "바꾸는이", username: `MoveMe${tag}` });

  // 주소창에 대문자로 쳐도 같은 사람이다.
  assert.equal(
    (await profile(viewer, `MOVEME${tag.toUpperCase()}`)).status,
    200,
  );

  // 친구가 된 뒤 이름을 바꿔도 관계와 id는 그대로다.
  assert.equal(
    (
      await req("POST", "/friends/requests", {
        token: viewer.token,
        body: { username: target.username },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req("POST", `/friends/requests/${viewer.data.user.id}/accept`, {
        token: target.token,
      })
    ).status,
    200,
  );

  const renamed = `renamed${tag}`;
  assert.equal((await setUsername(target.token, renamed)).status, 200);

  const stale = await profile(viewer, `moveme${tag}`);
  assert.equal(stale.status, 404, "옛 이름은 더 이상 열리지 않는다");
  assert.equal(stale.data.code, "user_unavailable");

  const fresh = await profile(viewer, renamed);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.data.userId, target.data.user.id, "id는 그대로다");
  assert.equal(fresh.data.relationship, "friends", "친구 관계가 유지된다");

  const friends = await req("GET", "/friends", { token: viewer.token });
  assert.equal(friends.data.friends[0].username, renamed);
});

test("차단·이름 없음·없는 이름은 모두 같은 404로 보인다", async () => {
  const viewer = await signup();
  const blocked = await signup({ name: "차단됨" });
  const nameless = await signup({ username: null });

  assert.equal((await profile(viewer, `ghost${uniq("")}`)).status, 404);
  assert.equal(
    (await search(viewer, `ghost${uniq("")}`)).data.results.length,
    0,
  );

  assert.equal(
    (
      await req("POST", "/moderation/blocks", {
        token: viewer.token,
        body: { userId: blocked.data.user.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (await profile(viewer, blocked.username)).status,
    404,
    "차단한 상대는 없는 사람으로 보인다",
  );
  assert.equal((await search(viewer, blocked.username)).data.results.length, 0);
  // 차단당한 쪽에서도 마찬가지다 — 차단 사실 자체가 새면 안 된다.
  assert.equal((await profile(blocked, viewer.username)).status, 404);
  assert.equal((await search(blocked, viewer.username)).data.results.length, 0);
  assert.equal(
    (
      await req("POST", "/friends/requests", {
        token: blocked.token,
        body: { username: viewer.username },
      })
    ).status,
    404,
    "차단은 딥링크로 온 요청도 막는다",
  );

  // 아직 이름을 정하지 않은 계정은 검색 대상이 아니다.
  assert.equal(nameless.username, null);
  const namelessSearch = await search(viewer, "u");
  assert.equal(namelessSearch.status, 200);
  assert.ok(
    !namelessSearch.data.results.some(
      (row) => row.userId === nameless.data.user.id,
    ),
  );
});
