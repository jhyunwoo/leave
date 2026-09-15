import { expect, test, type APIRequestContext } from "@playwright/test";
import { handleSafe } from "./helpers";

const SECTION_SIZE = 200;

/** 오늘(KST) 기준 n일 뒤의 달력 날짜. 고정 날짜 fixture는 그 날이 지나면 뜻이 뒤집힌다. */
function isoDaysFromToday(days: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
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

/**
 * 휴가/외출 탭.
 *
 * 외출은 당일 복귀라 세는 단위부터 다르다 — 한 목록에 쌓이면 "다음에 언제 나가는가"가
 * 묻힌다. 여기서 확인하는 것은 셋이다: 고른 갈래만 보이는가, 빈 갈래가 고장처럼
 * 보이지 않는가, 탭을 오가도 "더 보기"로 펼친 몫이 처음으로 돌아가는가.
 */
test("휴가/외출 탭은 목록을 갈래로 가르고 펼친 몫을 되돌린다", async ({
  page,
  request,
}) => {
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

  const tabs = page.getByRole("group", { name: "출타 종류" });
  const leaveTab = tabs.getByRole("button", { name: "휴가 400" });
  const outingTab = tabs.getByRole("button", { name: "외출 0" });
  await expect(leaveTab).toHaveAttribute("aria-pressed", "true");

  // 지난 몫을 한 번 더 펼쳐 둔다 — 탭을 오간 뒤 이 상태가 남으면 안 된다.
  const pastMore = page.locator('button[aria-controls="past-leaves"]');
  await pastMore.click();
  await expect(page.locator(".content-row")).toHaveCount(
    INITIAL_VISIBLE_PER_SECTION * 3,
  );

  // 외출이 하나도 없어도 화면이 비어 고장처럼 보이면 안 된다.
  await outingTab.click();
  await expect(outingTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".content-row")).toHaveCount(0);
  await expect(page.getByText("등록한 외출 기록이 없어요")).toBeVisible();

  await leaveTab.click();
  await expect(page.locator(".content-row")).toHaveCount(
    INITIAL_VISIBLE_PER_SECTION * 2,
  );
  await expect(pastMore).toHaveAccessibleName(
    "지난 휴가 20건 더 보기 · 180건 남음",
  );
});

test("내 휴가 목록에서 진행 상태를 바로 바꾸고 새로고침 후에도 유지한다", async ({
  page,
  request,
}) => {
  const token = await createAccount(request);
  // 빠른 상태 변경은 복귀 전 휴가에서만 뜬다 — 복귀일이 지나면 서버가 "복귀 완료"로
  // 내려주고 컨트롤 자리에는 안내 문구가 들어간다. 고정 날짜를 쓰면 그 날이 지나는
  // 순간 이 테스트가 조용히 다른 것을 확인하게 된다.
  const start = isoDaysFromToday(10);
  const end = isoDaysFromToday(12);
  const created = await request.post("http://localhost:8787/leaves", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: "상태 변경 휴가",
      status: "shared",
      segments: [
        {
          category: "annual",
          startDate: start,
          endDate: end,
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

test("휴가 중 카운트다운은 매초 갱신되고 복귀 시각에 종료한다", async ({
  page,
  request,
}) => {
  const token = await createAccount(request);
  await page.clock.install({ time: new Date("2026-09-08T11:00:00Z") });
  await page.route("**/leaves/mine", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "http://localhost:5173" },
      body: JSON.stringify({
        leaves: [
          { ...fakeLeave("countdown", "2026-09-08"), returnTime: "21:00" },
        ],
      }),
    }),
  );
  await page.addInitScript(
    (value) => localStorage.setItem("leave.token", value),
    token,
  );
  await page.goto("/leaves");
  const card = page.getByTestId("next-leave-card");
  await expect(card).toBeVisible();
  await page.clock.pauseAt(new Date("2026-09-08T11:59:57Z"));
  await expect(card).toContainText("0시간 00분 03초");
  await page.clock.fastForward(1_000);
  await expect(card).toContainText("0시간 00분 02초");
  await page.clock.fastForward(2_000);
  await expect(card).toHaveCount(0);
});
