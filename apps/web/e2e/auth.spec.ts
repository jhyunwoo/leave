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

test("회원가입: 개인정보 동의 전에는 완료 불가, 동의 후 가입되어 부대 화면으로 이동", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const email = `e2e-${Date.now()}@test.com`;
  await page.goto("/signup");
  await expect(page).toHaveTitle(/리브/);

  // 1단계: 계정
  await page.getByPlaceholder("you@example.com").fill(email);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill("password123");
  await passwords.nth(1).fill("password123");
  await page.getByPlaceholder("홍길동").fill("이순신");
  await page.getByRole("button", { name: "다음" }).click();

  // 2단계: 군 정보 (입대일 입력 시 전역일 자동 제안)
  await page.getByRole("button", { name: "공군", exact: true }).click();
  const militaryDates = page.locator('input[type="date"]');
  await militaryDates.first().fill("2026-03-23");
  await expect(militaryDates.nth(1)).toHaveValue("2027-12-22");
  await expect(page.getByText("표준 진급일은 매월 1일이에요")).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await page.getByRole("button", { name: "다음" }).click();

  // 3단계: 동의 전에는 "가입 완료" 비활성
  const finish = page.getByRole("button", { name: "가입 완료" });
  await expect(finish).toBeDisabled();

  // 동의 체크 → 활성화 → 가입
  await page.getByRole("checkbox").check();
  await expect(finish).toBeEnabled();
  await finish.click();

  // 가입 후 부대 찾기 화면으로 이동
  await expect(page).toHaveURL(/\/units/, { timeout: 15_000 });
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
