import { expect, test } from "@playwright/test";

/**
 * 인증 흐름 e2e (로그인 화면, 동의 기반 회원가입).
 * 실행 방법은 playwright.config.ts 상단 주석 참고.
 * 선택자는 현재 UI의 문구/역할에 기반하므로 문구가 바뀌면 함께 갱신한다.
 */

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
  const email = `e2e-${Date.now()}@test.com`;
  await page.goto("/signup");

  // 1단계: 계정
  await page.getByPlaceholder("you@example.com").fill(email);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill("password123");
  await passwords.nth(1).fill("password123");
  await page.getByPlaceholder("홍길동").fill("이순신");
  await page.getByRole("button", { name: "다음" }).click();

  // 2단계: 군 정보 (입대일 입력 시 전역일 자동 제안)
  await page.locator('input[type="date"]').first().fill("2026-01-05");
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
