import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const API = "http://localhost:8787";
const PASSWORD = "password123";

function uniqueTag() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 계정을 만들고 공개 사용자 이름까지 정해 준다.
 *
 * 0023부터 친구 찾기가 이름 기반이라, 이름이 없는 계정은 검색되지도 요청을 받지도
 * 못한다. `username: null`을 넘기면 이름 없는 옛 계정을 그대로 흉내 낸다.
 */
async function signup(
  request: APIRequestContext,
  tag: string,
  name: string,
  username?: string | null,
) {
  const email = `friends-e2e-${tag}-${uniqueTag()}@test.com`;
  const response = await request.post(`${API}/auth/signup`, {
    data: {
      email,
      password: PASSWORD,
      name,
      branch: "air_force",
      enlistedAt: "2026-03-23",
      dischargeAt: "2027-12-22",
      rank: "private",
      dataConsent: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    token: string;
    user: { id: string };
  };
  let handle: string | null = null;
  if (username !== null) {
    // 꼬리표에 하이픈이 섞여 들어올 수 있다(`friend-0`). 이름에 쓸 수 없는
    // 문자라 그대로 넣으면 서버가 400으로 거절하고, 화면 흐름은 시작도 못 한다.
    const chosen =
      username ??
      `e2e${tag}${uniqueTag()}`.toLowerCase().replace(/[^a-z0-9._]/g, "");
    const set = await request.put(`${API}/users/me/username`, {
      headers: authorization(body.token),
      data: { username: chosen },
    });
    expect(set.ok(), `username ${chosen}: ${await set.text()}`).toBeTruthy();
    handle = ((await set.json()) as { username: string }).username;
  }
  return { email, token: body.token, id: body.user.id, username: handle };
}

function authorization(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function signIn(page: Page, token: string) {
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);
}

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//,
    (route) => route.fulfill({ contentType: "text/css", body: "" }),
  );
});

test("사용자 이름 검색 → 프로필 → 요청 → 명시적 수락 → 삭제", async ({
  page,
  request,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const me = await signup(request, "a", "요청보낸이");
  const target = await signup(request, "b", "요청받은이");
  await signIn(page, me.token);

  // 1) 친구 탭에는 이메일 입력칸이 없다.
  await page.goto("/friends");
  await expect(
    page.getByRole("heading", { name: "친구", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("정확한 가입 이메일")).toHaveCount(0);
  await expect(page.getByText("아직 친구가 없어요.")).toBeVisible();

  // 2) @아이디로 검색한다. 대문자로 쳐도 같은 사람이 나온다.
  await page
    .getByTestId("friend-search-input")
    .fill(target.username!.toUpperCase());
  const result = page.getByTestId(`search-result-${target.username}`);
  await expect(result).toBeVisible();
  await expect(result).toContainText(`@${target.username}`);

  // 3) 결과를 누르면 프로필이 열리고, 거기서 요청을 보낸다.
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/u/${target.username}$`));
  await expect(page.getByRole("heading", { name: "요청받은이" })).toBeVisible();
  await page.getByTestId("profile-add-friend").click();
  await expect(page.getByRole("status").first()).toContainText(
    "친구 요청을 보냈어요",
  );
  await expect(page.getByTestId("profile-cancel-request")).toBeVisible();
  // 아직 친구가 아니므로 일정 섹션이 없다.
  await expect(page.getByText("공유된 휴가 일정")).toHaveCount(0);

  // 4) 받은 쪽이 같은 사람에게 요청을 보내도 자동으로 친구가 되지 않는다.
  const crossed = await request.post(`${API}/friends/requests`, {
    headers: authorization(target.token),
    data: { username: me.username },
  });
  expect(crossed.status()).toBe(409);
  expect(((await crossed.json()) as { code: string }).code).toBe(
    "incoming_request_exists",
  );

  // 5) 받은 쪽이 화면에서 명시적으로 수락한다.
  const targetPage = await page.context().newPage();
  await targetPage.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, target.token);
  await targetPage.goto("/friends");
  const incoming = targetPage.locator("section").filter({
    has: targetPage.getByRole("heading", { name: "받은 요청" }),
  });
  await expect(incoming).toContainText(`@${me.username}`);
  await incoming.getByRole("button", { name: "수락" }).click();
  await expect(targetPage.getByRole("status").first()).toContainText(
    "친구가 되었어요",
  );

  // 6) 요청을 보낸 쪽 프로필이 친구 상태가 되고 일정 섹션이 열린다.
  await page.reload();
  await expect(page.getByTestId("profile-remove-friend")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "공유된 휴가 일정" }),
  ).toBeVisible();

  // 7) 프로필 링크 공유(클립보드 대체 경로) — 정본 HTTPS 주소를 쓴다.
  await expect(page.getByTestId("profile-share")).toBeVisible();
  await expect(
    page.getByText(`leave.moveto.kr/u/${target.username}`),
  ).toBeVisible();

  // 8) 어느 한쪽이 삭제하면 양쪽에서 사라진다.
  const removed = await request.delete(`${API}/friends/${me.id}`, {
    headers: authorization(target.token),
  });
  expect(removed.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId("profile-add-friend")).toBeVisible();
  await expect(page.getByText("공유된 휴가 일정")).toHaveCount(0);

  const stale = await request.get(
    `${API}/friends/${target.id}/schedule?startDate=2026-01-01&endDate=2026-12-31`,
    { headers: authorization(me.token) },
  );
  expect(stale.status()).toBe(403);

  await targetPage.close();
  expect(consoleErrors).toEqual([]);
});

test("한글 사용자 이름 검색과 이름 중복 안내", async ({ page, request }) => {
  const tag = uniqueTag();
  const me = await signup(request, "ko", "한글찾는이");
  const korean = await signup(request, "ko2", "한글이름", `현우${tag}`);
  await signIn(page, me.token);

  await page.goto("/friends");
  await page.getByTestId("friend-search-input").fill(`현우${tag}`);
  const result = page.getByTestId(`search-result-${korean.username}`);
  await expect(result).toBeVisible();
  await expect(result).toContainText("한글이름");

  // 이미 쓰이는 이름으로 바꾸려 하면 중복 안내가 뜬다.
  await page.goto("/profile");
  await page.getByTestId("profile-edit-username").click();
  await page.getByTestId("profile-username-input").fill(korean.username!);
  await expect(page.getByText("이미 사용 중인 이름이에요")).toBeVisible();
});

test("로그아웃 공개 프로필은 최소 정보만 보이고 로그인 뒤 인증 프로필로 돌아온다", async ({
  page,
  request,
}) => {
  const target = await signup(request, "deep", "딥링크대상");
  const visitor = await signup(request, "visitor", "방문자");

  await page.goto(`/u/${target.username}`);
  await expect(page).toHaveURL(new RegExp(`/u/${target.username}$`));
  await expect(page.getByTestId("public-profile")).toBeVisible();
  await expect(page.getByRole("heading", { name: "딥링크대상" })).toBeVisible();
  await expect(
    page.getByText(`@${target.username}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("공개 프로필에는 이름과 사용자 이름만 표시돼요."),
  ).toBeVisible();
  await expect(page.getByText(target.email)).toHaveCount(0);
  await expect(page.getByTestId("profile-add-friend")).toHaveCount(0);
  await expect(page.getByText("공유된 휴가 일정")).toHaveCount(0);

  const loginCta = page.getByTestId("public-profile-login");
  await expect(loginCta).toHaveAttribute(
    "href",
    `/login?next=%2Fu%2F${target.username}`,
  );
  await loginCta.click();
  await expect(page).toHaveURL(
    new RegExp(`/login\\?next=%2Fu%2F${target.username}$`),
  );
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

  await page.getByPlaceholder("you@example.com").fill(visitor.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  // exact: true 가 필요하다 — 기본 매칭은 부분 일치라 "패스키로 로그인"까지 잡힌다.
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/u/${target.username}$`), {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "딥링크대상" })).toBeVisible();
  await expect(page.getByTestId("profile-add-friend")).toBeVisible();
});

test("없는 공개 사용자 이름은 로그인 없이 찾을 수 없음 화면을 보여준다", async ({
  page,
}) => {
  const missing = `missing${uniqueTag()}`;
  await page.goto(`/u/${missing}`);

  await expect(page).toHaveURL(new RegExp(`/u/${missing}$`));
  await expect(
    page.getByRole("heading", { name: "사용자를 찾을 수 없어요" }),
  ).toBeVisible();
  await expect(
    page.getByText("사용자 이름이 바뀌었거나 공개 프로필이 없는 계정이에요."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "리브 홈으로" })).toBeVisible();
});

test("이름 없는 옛 계정은 1회성 설정 화면을 지나야 앱에 들어간다", async ({
  page,
  request,
}) => {
  const tag = uniqueTag();
  const legacy = await signup(request, "legacy", "옛계정", null);
  expect(legacy.username).toBeNull();
  await signIn(page, legacy.token);

  await page.goto("/friends");
  await expect(
    page.getByRole("heading", { name: "사용자 이름을 정해주세요" }),
  ).toBeVisible();
  await page.getByTestId("username-setup-input").fill(`legacy${tag}`);
  await expect(page.getByText("사용할 수 있어요")).toBeVisible();
  await page.getByTestId("username-setup-submit").click();

  // 설정이 끝나면 원래 가려던 주소가 그대로 열린다.
  await expect(
    page.getByRole("heading", { name: "친구", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("요청 수락, 10명 비교, 친구 달력과 개인 일정 CRUD", async ({
  page,
  request,
}) => {
  const me = await signup(request, "owner", "달력주인");
  const friends = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      signup(
        request,
        `friend-${index}`,
        `친구${String(index + 1).padStart(2, "0")}`,
      ),
    ),
  );

  for (const friend of friends) {
    const sent = await request.post(`${API}/friends/requests`, {
      headers: authorization(friend.token),
      data: { username: me.username },
    });
    expect(
      sent.ok(),
      `friend request failed (${sent.status()}): ${await sent.text()}`,
    ).toBeTruthy();
  }
  for (const friend of friends.slice(1)) {
    const accepted = await request.post(
      `${API}/friends/requests/${friend.id}/accept`,
      { headers: authorization(me.token) },
    );
    expect(accepted.ok()).toBeTruthy();
  }

  const firstUnit = await request.post(`${API}/units`, {
    headers: authorization(friends[0]!.token),
    data: { name: `친구부대-${Date.now()}`, maxLeaveCount: 3 },
  });
  expect(firstUnit.ok()).toBeTruthy();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const friendLeave = await request.post(`${API}/leaves`, {
    headers: authorization(friends[0]!.token),
    data: {
      title: "노출되면 안 되는 제목",
      status: "shared",
      segments: [{ category: "annual", startDate: today, endDate: today }],
    },
  });
  expect(friendLeave.ok()).toBeTruthy();

  await signIn(page, me.token);
  await page.goto("/friends");
  const incoming = page.locator("section").filter({
    has: page.getByRole("heading", { name: "받은 요청" }),
  });
  await expect(incoming.getByText("친구01")).toBeVisible();
  await incoming.getByRole("button", { name: "수락" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "친구가 되었어요",
  );

  const friendSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "내 친구" }),
  });
  const choices = friendSection.getByRole("checkbox");
  await expect(choices).toHaveCount(11);
  for (let index = 0; index < 10; index += 1) await choices.nth(index).check();
  await expect(friendSection.getByText("10 / 10 선택")).toBeVisible();
  await expect(choices.nth(10)).toBeDisabled();
  await expect(
    friendSection.getByText("한 번에 최대 10명까지 비교할 수 있어요."),
  ).toBeVisible();
  await friendSection
    .getByRole("button", { name: "선택한 친구와 달력 보기" })
    .click();

  await expect(page).toHaveURL(/mode=friends/);
  await expect(
    page.getByRole("button", { name: "친구", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("grid", { name: /친구 달력/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "이전 달" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다음 달" })).toHaveCount(0);
  const friendScroller = page.locator(".cal-scroll");
  const initialScrollTop = await friendScroller.evaluate(
    (element) => element.scrollTop,
  );
  await friendScroller.evaluate((element) => {
    element.scrollBy({ top: 700, behavior: "auto" });
  });
  await expect
    .poll(() => friendScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScrollTop + 300);
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  await expect(page.getByLabel(/휴가 친구01/)).toBeVisible();
  await expect(page.getByText("노출되면 안 되는 제목")).toHaveCount(0);

  await page.getByRole("button", { name: "개인 일정 추가" }).click();
  const create = page.getByRole("dialog", { name: "개인 일정 추가" });
  await create.getByLabel("제목").fill("개인 운동");
  await create.getByLabel("시작일").fill(today);
  await create.getByLabel("종료일").fill(today);
  await create.getByRole("button", { name: "저장" }).click();
  await expect(create).toBeHidden();

  const day = Number(today.slice(8));
  const dayCell = page.getByRole("gridcell", {
    name: new RegExp(`^${day}일,.*개인 일정 1개$`),
  });
  await expect(dayCell).toBeVisible();
  await dayCell.click();
  await page.getByRole("button", { name: /개인 운동/ }).click();
  const edit = page.getByRole("dialog", { name: "개인 일정 수정" });
  await edit.getByLabel("제목").fill("개인 운동 수정");
  await edit.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByRole("button", { name: /개인 운동 수정/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /개인 운동 수정/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog", { name: "개인 일정 수정" })
    .getByRole("button", { name: "삭제" })
    .click();
  await expect(page.getByText("이 날의 개인 일정이 없어요.")).toBeVisible();

  // 부대가 없어도 달력은 열린다(93d7d22) — 빈 화면 대신 "부대 가입"이 주 행동으로 남는다.
  await page.getByRole("button", { name: "부대" }).click();
  await expect(page.getByRole("button", { name: "부대 가입" })).toBeVisible();
  // 모드만 오가도 고른 친구(?friends=)는 그대로다.
  await page.getByRole("button", { name: "친구", exact: true }).click();
  await expect(
    page.getByRole("grid", { name: /친구 달력/ }).first(),
  ).toBeVisible();
});

test("친구 휴가 알림에서 내 휴가 유무와 관계없이 날짜별 비교 모달을 연다", async ({
  page,
  request,
}) => {
  const me = await signup(request, "notifyme", "나");
  const friend = await signup(request, "notifyfriend", "알림친구");
  for (const user of [me, friend]) {
    expect(
      (
        await request.post(`${API}/units`, {
          headers: authorization(user.token),
          data: { name: `알림비교-${uniqueTag()}`, maxLeaveCount: 3 },
        })
      ).ok(),
    ).toBeTruthy();
  }
  expect(
    (
      await request.post(`${API}/friends/requests`, {
        headers: authorization(me.token),
        data: { username: friend.username },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`${API}/friends/requests/${me.id}/accept`, {
        headers: authorization(friend.token),
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`${API}/leaves`, {
        headers: authorization(me.token),
        data: {
          title: "내 비교 휴가",
          segments: [
            {
              category: "annual",
              startDate: "2026-11-03",
              endDate: "2026-11-03",
            },
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`${API}/leaves`, {
        headers: authorization(friend.token),
        data: {
          title: "친구 비공개 제목",
          segments: [
            {
              category: "annual",
              startDate: "2026-11-02",
              endDate: "2026-11-04",
            },
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();
  await signIn(page, me.token);
  await page.goto("/notifications");
  await page.getByRole("button", { name: "자세히", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("알림친구");
  await expect(dialog).toContainText("이 날짜에는 내 휴가가 없어요.");
  await dialog.getByRole("button", { name: "다음 날짜" }).click();
  await expect(dialog).toContainText("내 비교 휴가");
  await expect(dialog).not.toContainText("친구 비공개 제목");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/notifications$/);
  expect(
    (
      await request.delete(`${API}/friends/${friend.id}`, {
        headers: authorization(me.token),
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole("button", { name: "자세히", exact: true }).click();
  await expect(dialog).toContainText(
    "친구 관계가 변경되어 이 일정을 볼 수 없어요.",
  );
  await expect(dialog).not.toContainText("내 비교 휴가");
  await expect(dialog).not.toContainText("알림친구님의 휴가");
});
