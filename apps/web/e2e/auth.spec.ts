import { expect, test } from "@playwright/test";
import { handleSafe } from "./helpers";

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
  // exact: true 가 필요하다 — 기본 매칭은 부분 일치라 "패스키로 로그인"까지 잡힌다.
  const submit = page.getByRole("button", { name: "로그인", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByPlaceholder("you@example.com").fill("someone@test.com");
  await page.locator('input[type="password"]').fill("password123");
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("link", { name: "가입하기" })).toBeVisible();
});

/*
 * 오픈 리다이렉트.
 *
 * `?next=`는 로그인 뒤 돌아갈 곳이다. 앞글자가 `/`인지만 보는 검사로는 부족하다 —
 * `//evil.example`은 막히지만 `/\evil.example`은 그대로 통과하는데, URL 파서는
 * 슬래시 뒤의 역슬래시를 슬래시와 똑같이 읽어 두 값을 같은 외부 주소로 만든다.
 *
 * 로그인까지 가지 않고도 판정을 볼 수 있다 — 로그인 화면의 "가입하기"가 같은
 * `safeNext` 결과를 링크로 달고 나오기 때문이다.
 */
test("로그인 화면의 ?next=는 이 사이트 안의 경로로만 해석된다", async ({
  page,
}) => {
  const signupLink = page.getByRole("link", { name: "가입하기" });

  for (const hostile of [
    "/\\evil.example",
    "//evil.example",
    "/\\\\evil.example",
    "https://evil.example",
  ]) {
    await page.goto(`/login?next=${encodeURIComponent(hostile)}`);
    const href = await signupLink.getAttribute("href");
    expect(href, `${hostile} 이(가) 목적지로 살아남았다: ${href}`).toBe(
      "/signup",
    );
  }

  // 이 사이트 안의 경로는 그대로 실려 간다 — 막느라 정상 동작까지 잃지 않는다.
  await page.goto(`/login?next=${encodeURIComponent("/leaves?tab=mine")}`);
  expect(await signupLink.getAttribute("href")).toBe(
    `/signup?next=${encodeURIComponent("/leaves?tab=mine")}`,
  );

  // 목적지를 들고 이동해도 외부로 새지 않는다.
  await page.goto(`/login?next=${encodeURIComponent("/\\evil.example")}`);
  await signupLink.click();
  expect(new URL(page.url()).origin).toBe("http://localhost:5173");
});

test("회원가입 후 한 화면 한 입력 온보딩 9단계", async ({ page }) => {
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
  await expect(
    step("rank").locator('[role="radio"][aria-checked="true"]'),
  ).toHaveCount(1);
  await expect(step("rank").getByText("자동 계산")).toBeVisible();
  await next.click();

  // 공개 사용자 이름은 프로필을 저장한 뒤에 묻는다(이어하기 판정 때문 —
  // packages/shared/src/onboarding.ts의 단계 목록 주석 참고).
  await expect(step("username")).toBeVisible();
  const handle = `e2e${Date.now().toString(36)}`;
  await page.getByTestId("onboarding-username").fill("bad name");
  await expect(
    step("username").getByText(
      "영문·한글·숫자와 마침표(.), 밑줄(_)만 쓸 수 있어요",
    ),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByTestId("onboarding-username").fill(handle);
  await expect(step("username").getByText("사용할 수 있어요")).toBeVisible();
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
  // 0023부터 이름이 없으면 웹 앱이 1회성 설정 화면을 먼저 띄운다. 이 테스트가
  // 보려는 것은 적립분 화면이므로 여기서 이름을 정하고 지나간다.
  const handle = await request.put("http://localhost:8787/users/me/username", {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { username: handleSafe("grant") },
  });
  expect(
    handle.ok(),
    `username failed (${handle.status()}): ${await handle.text()}`,
  ).toBeTruthy();
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
  await page.getByRole("link", { name: "보유 휴가" }).click();
  await expect(page).toHaveURL(/\/leaves\/grants$/);
  await expect(
    page.getByRole("heading", { name: "보유 휴가", exact: true }),
  ).toBeVisible();

  // 총량 입력 화면은 적립분 장부로 바뀌었다. 기본 연가 적립분을 수정하고
  // 포상휴가 적립분을 하나 추가해 같은 32일/5일 상태를 만든다.
  const annualFund = page.locator("section").filter({
    has: page.getByRole("heading", { name: "연가", exact: true }),
  });
  await annualFund.getByRole("button", { name: "수정" }).click();
  const editGrant = page.getByRole("dialog", { name: "적립분 수정" });
  await editGrant.getByLabel("일수").fill("32");
  await editGrant.getByRole("button", { name: "수정" }).click();
  await expect(editGrant).toBeHidden();
  await expect(annualFund).toContainText("총 32일");

  await page.getByRole("button", { name: "+ 포상휴가" }).click();
  const addGrant = page.getByRole("dialog", { name: "적립분 추가" });
  await addGrant.getByLabel("일수").fill("5");
  await addGrant.getByRole("button", { name: "추가" }).click();
  await expect(addGrant).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "포상휴가", exact: true }),
  ).toBeVisible();

  await page.goto("/leaves");
  await page.getByRole("button", { name: "휴가 등록" }).click();
  await page.getByPlaceholder("예: 제주도 가족여행").fill("복합 휴가");
  // 휴가 기간은 자체 달력으로 고른다. `input[type="date"]`로 잡으면 구간 편집기의
  // 종료일 칸에 걸려 조용히 엉뚱한 값이 들어간다.
  const range = page.getByTestId("leave-date-range");
  await range.getByTestId("leave-date-range-start").click();
  const panel = page.getByTestId("leave-date-range-calendar");
  // 패널은 오늘이 속한 달에서 열린다. 클릭 횟수를 오늘 날짜로 역산하면 시간이
  // 지나며 깨지므로, 달 표시를 보고 맞을 때까지 넘긴다.
  while ((await panel.getAttribute("data-month")) !== "2026-09") {
    await page.getByTestId("leave-date-range-calendar-next").click();
  }
  await page.getByTestId("leave-date-range-calendar-day-2026-09-01").click();
  // 시작일을 고르면 종료일 선택으로 넘어가고 달도 9월로 따라온다.
  await page.getByTestId("leave-date-range-calendar-day-2026-09-05").click();
  // 5일짜리 기본 연가 구간을 3일/2일로 나눈 뒤 둘째 재원을 포상휴가로 바꾼다.
  await page.getByRole("button", { name: "구간 추가" }).click();
  await page
    .getByRole("combobox", { name: "2번째 구간 휴가 재원" })
    .selectOption("award");
  await page.getByRole("button", { name: "휴가 등록" }).last().click();

  const savedLeave = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: "복합 휴가" }),
  });
  await expect(savedLeave).toContainText("연가 9/1–9/3");
  await expect(savedLeave).toContainText("포상휴가 9/4–9/5");
});
