import { expect, test } from "@playwright/test";

/**
 * 인증 흐름 e2e (로그인 화면, 동의 기반 회원가입).
 * 실행 방법은 playwright.config.ts 상단 주석 참고.
 * 선택자는 현재 UI의 문구/역할에 기반하므로 문구가 바뀌면 함께 갱신한다.
 */

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//,
    (route) => route.fulfill({ contentType: "text/css", body: "" }),
  );
});

test("로그인 화면 렌더링 + 빈 값이면 제출 버튼 비활성", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  const submit = page.getByRole("button", { name: "로그인" });
  await expect(submit).toBeDisabled();
  await page.getByPlaceholder("you@example.com").fill("someone@test.com");
  await page.locator('input[type="password"]').fill("password123");
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("link", { name: "가입하기" })).toBeVisible();
});

test("회원가입 후 한 화면 한 입력 온보딩 8단계", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const email = `e2e-${Date.now()}@test.com`;
  await page.goto("/signup");
  await expect(page).toHaveTitle(/리브/);

  // 계정 생성
  await page.getByPlaceholder("you@example.com").fill(email);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill("password123");
  await passwords.nth(1).fill("password123");
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await checks.nth(2).check();
  await page.getByRole("button", { name: "가입하고 시작" }).click();

  const next = page.getByTestId("onboarding-next");
  // 단계마다 입력이 하나뿐이라, 화면이 바뀌었는지는 단계 id로 확인한다.
  const step = (id: string) => page.getByTestId(`onboarding-step-${id}`);

  await expect(step("welcome")).toBeVisible();
  await next.click();

  await expect(step("name")).toBeVisible();
  await page.getByTestId("onboarding-name").fill("푸른고래");
  await next.click();

  await expect(step("branch")).toBeVisible();
  await page.getByTestId("onboarding-branch-air_force").click();
  await next.click();

  await expect(step("dates")).toBeVisible();
  await page.getByTestId("onboarding-enlisted-at").fill("2026-03-23");
  // 전역 예정일은 입대일 + 군종 복무기간에서 자동으로 채워진다.
  await expect(page.getByTestId("onboarding-discharge-at")).toHaveValue(
    "2027-12-22",
  );
  await next.click();

  // 계급은 입대일 기준 표준 진급표로 미리 골라져 있다. 어떤 계급이 나올지는
  // 실행 시점에 따라 달라지므로, 정확히 하나가 선택돼 있다는 것만 확인한다.
  await expect(step("rank")).toBeVisible();
  await expect(step("rank").locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
  await expect(step("rank").getByText("자동 계산")).toBeVisible();
  await next.click();

  // 공군이므로 정기외박 단계가 있다(육군이면 건너뛴다).
  await expect(step("overnight")).toBeVisible();
  await page.getByTestId("onboarding-overnight-skip").click();

  await expect(step("group")).toBeVisible();
  await page.getByTestId("onboarding-group-skip").click();

  // 마지막 요약에는 앞서 답한 값이 그대로 되짚어져야 한다.
  await expect(step("done")).toBeVisible();
  await expect(step("done")).toContainText("푸른고래");
  await expect(step("done")).toContainText("공군");
  await page.getByTestId("onboarding-complete").click();

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  expect(consoleErrors).toEqual([]);
});

test("휴가 총량 수정 후 여러 재원을 한 일정에 배분", async ({
  page,
  request,
}) => {
  const email = `leave-e2e-${Date.now()}@test.com`;
  const signup = await request.post("http://localhost:8787/auth/signup", {
    data: {
      email,
      password: "password123",
      name: "휴가테스터",
      branch: "air_force",
      enlistedAt: "2026-03-23",
      dischargeAt: "2027-12-22",
      rank: "private",
      dataConsent: true,
    },
  });
  expect(signup.ok()).toBeTruthy();
  const auth = (await signup.json()) as { token: string };
  const unit = await request.post("http://localhost:8787/units", {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      name: `E2E부대-${Date.now()}`,
      maxLeaveCount: 3,
    },
  });
  expect(unit.ok()).toBeTruthy();

  await page.addInitScript((token) => {
    localStorage.setItem("leave.token", token);
  }, auth.token);
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "보유 휴가 일수" }),
  ).toBeVisible();

  await page
    .locator("label")
    .filter({ hasText: /^연가/ })
    .locator("input")
    .fill("32");
  await page
    .locator("label")
    .filter({ hasText: /^포상휴가/ })
    .locator("input")
    .fill("5");
  await page.getByRole("button", { name: "휴가 일수 저장" }).click();
  await expect(page.getByText("휴가 총량을 저장했습니다.")).toBeVisible();

  await page.goto("/leaves");
  await page.getByRole("button", { name: "휴가 등록" }).click();
  await page.getByPlaceholder("예: 제주도 가족여행").fill("복합 휴가");
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill("2026-09-01");
  await dates.nth(1).fill("2026-09-05");
  await page.getByLabel("연가 사용 일수").fill("3");
  await page.getByLabel("포상휴가 사용 일수").fill("2");
  await page.getByRole("button", { name: "휴가 등록" }).last().click();

  await expect(page.getByText("복합 휴가")).toBeVisible();
  await expect(page.getByText("연가 3일")).toBeVisible();
  await expect(page.getByText("포상휴가 2일")).toBeVisible();
});
