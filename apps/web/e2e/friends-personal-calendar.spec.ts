import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:8787";
const PASSWORD = "password123";

async function signup(request: APIRequestContext, tag: string, name: string) {
  const email = `friends-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
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
  return { email, token: body.token, id: body.user.id };
}

function authorization(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//,
    (route) => route.fulfill({ contentType: "text/css", body: "" }),
  );
});

test("친구 탭은 공개 검색 없이 빈 상태와 정확한 이메일 요청을 제공한다", async ({
  page,
  request,
}) => {
  const me = await signup(request, "empty", "빈친구");
  const target = await signup(request, "target", "요청상대");
  await page.addInitScript((token) => {
    localStorage.setItem("leave.token", token);
  }, me.token);

  await page.goto("/friends");
  await expect(
    page.getByRole("heading", { name: "친구", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("아직 친구가 없어요.")).toBeVisible();
  await page.getByLabel("정확한 가입 이메일").fill(target.email.toUpperCase());
  await page.getByRole("button", { name: "요청 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("요청을 보냈어요");
  await expect(page.getByText("요청상대 · 수락 대기")).toBeVisible();
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
      data: { email: me.email },
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

  await page.addInitScript((token) => {
    localStorage.setItem("leave.token", token);
  }, me.token);
  await page.goto("/friends");
  const incoming = page.locator("section").filter({
    has: page.getByRole("heading", { name: "받은 요청" }),
  });
  await expect(incoming.getByText("친구01")).toBeVisible();
  await incoming.getByRole("button", { name: "수락" }).click();
  await expect(page.getByRole("status")).toContainText("친구가 되었어요");

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
  await expect(page.getByRole("grid", { name: /친구 달력/ })).toBeVisible();
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

  await page.getByRole("button", { name: "부대" }).click();
  await expect(page.getByText("소속 그룹이 없어요")).toBeVisible();
  await page.getByRole("button", { name: "친구 달력 보기" }).click();
  await expect(page.getByRole("grid", { name: /친구 달력/ })).toBeVisible();
});
