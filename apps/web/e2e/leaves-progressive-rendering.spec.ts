import { expect, test, type APIRequestContext } from "@playwright/test";
import { handleSafe } from "./helpers";

const SECTION_SIZE = 200;
const INITIAL_VISIBLE_PER_SECTION = 20;

async function createAccount(request: APIRequestContext): Promise<string> {
  const presetToken: string | undefined = process.env.LEAVE_E2E_TOKEN;
  if (presetToken) return presetToken;
  const signup = await request.post("http://localhost:8787/auth/signup", {
    data: {
      email: `large-leaves-${Date.now()}@test.com`,
      password: "password123",
      name: "대형목록테스터",
      branch: "army",
      enlistedAt: "2026-01-05",
      dischargeAt: "2027-07-04",
      rank: "private",
      dataConsent: true,
    },
  });
  expect(signup.ok()).toBeTruthy();
  const { token } = (await signup.json()) as { token: string };
  const handle = await request.put("http://localhost:8787/users/me/username", {
    headers: { Authorization: `Bearer ${token}` },
    data: { username: handleSafe("list") },
  });
  expect(
    handle.ok(),
    `username failed (${handle.status()}): ${await handle.text()}`,
  ).toBeTruthy();
  const unit = await request.post("http://localhost:8787/units", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `대형목록부대-${Date.now()}`, maxLeaveCount: 3 },
  });
  expect(unit.ok()).toBeTruthy();
  return token;
}

function fakeLeave(id: string, startDate: string) {
  return {
    id,
    title: `휴가 ${id}`,
    startDate,
    endDate: startDate,
    reason: null,
    status: "shared",
    segments: [
      {
        category: "annual",
        startDate,
        endDate: startDate,
        grantId: null,
      },
    ],
  };
}

test("400건 목록은 섹션별로 점진 렌더링한다", async ({ page, request }) => {
  const token = await createAccount(request);
  const upcoming = Array.from({ length: SECTION_SIZE }, (_, index) =>
    fakeLeave(`upcoming-${index}`, "2027-01-01"),
  );
  const past = Array.from({ length: SECTION_SIZE }, (_, index) =>
    fakeLeave(`past-${index}`, "2026-01-01"),
  );

  await page.route("**/leaves/mine", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "http://localhost:5173" },
      body: JSON.stringify({ leaves: [...upcoming, ...past] }),
    }),
  );
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);
  await page.goto("/leaves");
  await expect(page.getByRole("heading", { name: "내 휴가" })).toBeVisible();

  const initialRowCount = await page.locator(".content-row").count();
  const initialDomNodes = await page.locator("*").count();
  console.log(
    JSON.stringify({ initialRowCount, initialDomNodes, totalLeaves: 400 }),
  );

  await expect(page.locator(".content-row")).toHaveCount(
    INITIAL_VISIBLE_PER_SECTION * 2,
  );
  await expect(page.getByText("200건", { exact: true })).toHaveCount(2);
  expect(initialDomNodes).toBeLessThan(1_500);

  const pastMore = page.locator('button[aria-controls="past-leaves"]');
  await pastMore.click();
  await expect(page.locator(".content-row")).toHaveCount(
    INITIAL_VISIBLE_PER_SECTION * 3,
  );
  await expect(pastMore).toHaveAccessibleName(
    "지난 휴가 20건 더 보기 · 160건 남음",
  );
});

test("내 휴가 목록에서 진행 상태를 바로 바꾸고 새로고침 후에도 유지한다", async ({
  page,
  request,
}) => {
  const token = await createAccount(request);
  const created = await request.post("http://localhost:8787/leaves", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: "상태 변경 휴가",
      status: "shared",
      segments: [
        {
          category: "annual",
          startDate: "2026-09-01",
          endDate: "2026-09-03",
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);
  await page.goto("/leaves");

  const statusControl = page.getByRole("group", {
    name: "상태 변경 휴가 휴가 상태 변경",
  });
  await expect(statusControl).toBeVisible();
  await expect(
    statusControl.getByRole("button", { name: "희망" }),
  ).toHaveAttribute("aria-pressed", "true");

  await statusControl.getByRole("button", { name: "신청함" }).click();
  await expect(
    statusControl.getByRole("button", { name: "신청함" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("상태 · 신청함")).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "상태 변경 휴가 휴가 상태 변경" })
      .getByRole("button", { name: "신청함" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("내비게이션 배지와 알림함은 하나의 폴링 응답만 활성화한다", async ({
  page,
  request,
}) => {
  const token = await createAccount(request);
  let summaryGets = 0;
  let inboxGets = 0;
  const corsHeaders = {
    "access-control-allow-origin": "http://localhost:5173",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,OPTIONS",
  };

  await page.route("**/notifications/summary", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    summaryGets += 1;
    return route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ unreadCount: 2 }),
    });
  });
  await page.route("**/notifications", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    inboxGets += 1;
    return route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ notifications: [], unreadCount: 2 }),
    });
  });
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);
  await page.clock.install();

  await page.goto("/profile");
  await expect(
    page.getByRole("link", { name: "읽지 않은 알림 2개" }),
  ).toBeVisible();
  await expect.poll(() => summaryGets).toBe(1);
  expect(inboxGets).toBe(0);

  await page.clock.fastForward(30_100);
  await expect.poll(() => summaryGets).toBe(2);
  expect(inboxGets).toBe(0);

  await page.getByRole("link", { name: /알림/ }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect.poll(() => inboxGets).toBe(1);
  const summaryAtInboxOpen = summaryGets;

  await page.clock.fastForward(30_100);
  await expect.poll(() => inboxGets).toBe(2);
  expect(summaryGets).toBe(summaryAtInboxOpen);
});
