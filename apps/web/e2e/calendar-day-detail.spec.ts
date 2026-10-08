import { verifyTestEmail } from "./helpers";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { handleSafe } from "./helpers";

/**
 * 달력에서 날짜를 고르면 그 날 상세가 **닿을 수 있는 곳에** 나오는가.
 *
 * 좁은 화면에서 한 번 크게 깨졌던 자리다. 달력은 900px 이하에서 페이지 자체를
 * 스크롤포트로 쓰는 무한 세로 스크롤이 되는데(`.cal-scroll-shell.is-page-scroll`),
 * 상세 패널은 그 달력 **뒤에** 쌓여 있었다. 달을 내릴수록 다음 달이 또 붙으니
 * 패널까지 내려갈 방법이 없고, 사용자에게는 "날짜만 칠해지고 아무 일도 안 나는"
 * 화면으로 보였다. 그래서 좁은 화면에서는 상세를 모달로 띄운다.
 *
 * 실행: `pnpm --filter @leave/web test:e2e -- calendar-day-detail`
 */

const API = "http://localhost:8787";
const PASSWORD = "password123";

async function signup(request: APIRequestContext, tag: string) {
  const email = `cal-day-e2e-${handleSafe(tag)}@test.com`;
  const response = await request.post(`${API}/auth/signup`, {
    data: {
      email,
      password: PASSWORD,
      name: "달력사용자",
      branch: "air_force",
      enlistedAt: "2026-03-23",
      dischargeAt: "2027-12-22",
      rank: "private",
      dataConsent: true,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { token: string };
  await verifyTestEmail(request, body.token);
  const set = await request.put(`${API}/users/me/username`, {
    headers: { Authorization: `Bearer ${body.token}` },
    data: { username: handleSafe(tag) },
  });
  expect(set.ok(), await set.text()).toBeTruthy();
  return body.token;
}

async function signIn(page: Page, token: string) {
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);
}

/** 서울 기준 오늘. 달력이 처음 열리면서 스크롤해 두는 날이다. */
function todayInSeoul(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//,
    (route) => route.fulfill({ contentType: "text/css", body: "" }),
  );
});

test("좁은 화면: 날짜를 고르면 상세가 모달로 뜨고 화면 안에 있다", async ({
  page,
  request,
}) => {
  const token = await signup(request, "narrow");
  await signIn(page, token);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const today = todayInSeoul();
  const cell = page.getByTestId(`cal-cell-${today}`);
  await expect(cell).toBeVisible();
  await cell.click();

  const dialog = page.getByRole("dialog", { name: "날짜 상세" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "개인 일정" }),
  ).toBeVisible();

  // 화면 안에 있는가. 예전 버그는 "DOM에는 있는데 2500px 아래"였고,
  // 보이는지만 물으면 그 상태도 통과할 수 있다.
  const box = await dialog.boundingBox();
  expect(box, "상세 모달의 위치를 잴 수 없다").not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(844);

  // 닫으면 선택도 풀린다 — 같은 날짜를 다시 눌러 열 수 있어야 한다.
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
  await cell.click();
  await expect(page.getByRole("dialog", { name: "날짜 상세" })).toBeVisible();
});

test("좁은 화면: 상세에서 출타 등록을 열면 상세 모달이 비켜난다", async ({
  page,
  request,
}) => {
  const token = await signup(request, "stack");
  await signIn(page, token);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const today = todayInSeoul();
  await page.getByTestId(`cal-cell-${today}`).click();
  const dialog = page.getByRole("dialog", { name: "날짜 상세" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "추가" }).first().click();
  // 모달이 겹치면 뒤엣것이 배경 스크롤 잠금을 서로 덮어쓴다. 한 번에 하나만 뜬다.
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("넓은 화면: 날짜 상세는 달력 옆 칸에 그대로 붙는다", async ({
  page,
  request,
}) => {
  const token = await signup(request, "wide");
  await signIn(page, token);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const today = todayInSeoul();
  await page.getByTestId(`cal-cell-${today}`).click();

  await expect(page.getByRole("heading", { name: "개인 일정" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "날짜 상세" })).toHaveCount(0);
});

test("넓은 화면: 내 휴가를 누르면 옆 칸이 정보 창 하나가 되고 그 자리에서 수정한다", async ({
  page,
  request,
}) => {
  const token = await signup(request, "wide-leave");
  const unit = await request.post(`${API}/units`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `옆칸부대-${Date.now()}`, maxLeaveCount: 5 },
  });
  expect(unit.ok(), await unit.text()).toBeTruthy();
  const today = todayInSeoul();
  const created = await request.post(`${API}/leaves`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: "옆칸 휴가",
      segments: [{ category: "annual", startDate: today, endDate: today }],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  await signIn(page, token);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  await page.getByTestId(`cal-cell-${today}`).click();

  // 옆 칸의 첫 카드가 내 휴가다.
  const firstCard = page.locator(".cal-layout > :nth-child(2) > :first-child");
  await expect(
    firstCard.getByRole("heading", { name: "내 휴가" }),
  ).toBeVisible();
  await firstCard.getByRole("button", { name: /옆칸 휴가/ }).click();

  await expect(page.getByRole("heading", { name: "개인 일정" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "옆칸 휴가" })).toBeVisible();

  await page.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const title = page.getByPlaceholder("예: 제주도 가족여행");
  await expect(title).toHaveValue("옆칸 휴가");

  // 460px 옆 칸에서도 재원 이름이 잘리지 않아야 고를 수 있다.
  const kind = page.getByRole("combobox", { name: "1번째 구간 휴가 재원" });
  expect((await kind.boundingBox())?.width ?? 0).toBeGreaterThan(240);
  const days = page.getByRole("spinbutton", { name: "1번째 구간 사용 일수" });
  await page.getByRole("button", { name: "1번째 구간 1일 늘리기" }).click();
  await expect(days).toHaveValue("2");
  await page.getByRole("button", { name: "1번째 구간 1일 줄이기" }).click();
  await expect(days).toHaveValue("1");

  // 수정 양식이 길어 페이지를 끝까지 내려도 달력은 내비 아래에 붙어 있다.
  const calendar = page.locator(".cal-main");
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(async () => (await calendar.boundingBox())?.y ?? -1)
    .toBe(64 + 16);
  const calendarBox = await calendar.boundingBox();
  expect(
    (calendarBox?.y ?? 0) + (calendarBox?.height ?? 0),
  ).toBeLessThanOrEqual(900);

  await title.fill("고친 휴가");
  await page.getByRole("button", { name: "변경사항 저장" }).click();

  await expect(page.getByRole("heading", { name: "고친 휴가" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "‹ 날짜 상세" }).click();
  await expect(page.getByRole("heading", { name: "개인 일정" })).toBeVisible();
});
