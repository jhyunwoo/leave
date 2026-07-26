import { expect, test } from "@playwright/test";

test("로그인부터 대시보드, 사용자 관리, 감사 로그까지 동작한다", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const email = "admin.test@leave.local";
  const temporaryPassword = "LeaveAdmin!2026";
  const finalPassword = "LeaveAdmin!2026Changed";
  const unique = Date.now();

  await page.goto("/");
  await expect(page).toHaveTitle("리브 관리자");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();

  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(temporaryPassword);
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(
    page.getByRole("heading", { name: "임시 비밀번호를 변경해주세요" }),
  ).toBeVisible();
  await page.getByLabel("현재 비밀번호").fill(temporaryPassword);
  await page.getByLabel("새 비밀번호", { exact: true }).fill(finalPassword);
  await page.getByLabel("새 비밀번호 확인").fill(finalPassword);
  await page.getByRole("button", { name: "비밀번호 변경" }).click();

  await expect(page.getByRole("heading", { name: "운영 개요" })).toBeVisible();
  await expect(
    page.getByText("접속 로그", { exact: true }).first(),
  ).toBeVisible();
  // 최초 세션 확인의 의도된 401은 로그인 화면 전환에 사용된다.
  browserErrors.length = 0;
  await expect(page.getByText("비밀번호를 변경했습니다")).toBeHidden({
    timeout: 6_000,
  });
  await page.screenshot({
    path: "/tmp/leave-admin-desktop.png",
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "모바일 섹션 메뉴" }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  const summaryItems = page.locator(".summary-item");
  await expect(summaryItems).toHaveCount(4);
  await expect(summaryItems.nth(1)).toBeInViewport();
  await expect(summaryItems.nth(3)).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "전체 로그 보기" }),
  ).toBeInViewport();
  await page.screenshot({
    path: "/tmp/leave-admin-mobile.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 1440, height: 1024 });

  await page.getByRole("link", { name: "사용자" }).click();
  await expect(page.getByRole("heading", { name: "사용자" })).toBeVisible();
  await page.getByRole("button", { name: "사용자 추가" }).click();
  await page.getByLabel("이메일").fill(`browser-${unique}@leave.local`);
  await page.getByLabel("이름").fill("브라우저 테스트 사용자");
  await page.getByLabel("임시 비밀번호").fill("BrowserUser!2026");
  await page.getByLabel("군 종류").selectOption("army");
  await page.getByLabel("입대일").fill("2026-01-01");
  await page.getByLabel("전역 예정일").fill("2027-06-30");
  await page.getByLabel("가입 계급").selectOption("private_first");
  await page.getByLabel(/개인정보 수집 동의/).check();
  await page.getByRole("button", { name: "생성" }).click();

  await expect(page.getByText("데이터를 생성했습니다")).toBeVisible();
  await page
    .getByPlaceholder("검색", { exact: true })
    .fill(`browser-${unique}`);
  await expect(page.getByText("브라우저 테스트 사용자").first()).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
