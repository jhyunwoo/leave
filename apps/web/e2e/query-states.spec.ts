import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const user = {
  id: "query-state-user",
  email: "fixture@example.invalid",
  name: "상태 테스트",
  username: "state.fixture",
  branch: "army",
  branchLabel: "육군",
  enlistedAt: "2026-01-01",
  dischargeAt: "2027-07-01",
  unitId: null,
  rank: "private_first",
  rankLabel: "일병",
  nextPromotionDate: null,
  serviceProgress: 0.5,
  daysUntilDischarge: 200,
};
const me = { user, unit: null, joinRequest: null };

for (const scenario of [
  {
    path: "/leaves",
    endpoint: "/leaves/mine",
    error: "휴가 목록을 불러오지 못했어요",
    empty: "아직 등록한 휴가가 없어요",
    data: { leaves: [] },
  },
  {
    path: "/notifications",
    endpoint: "/notifications",
    error: "알림을 불러오지 못했어요",
    empty: "아직 알림이 없어요",
    data: { notifications: [], unreadCount: 0 },
  },
  {
    path: "/leaves/grants",
    endpoint: "/leaves/grants",
    error: "보유 휴가를 불러오지 못했어요",
    empty: null,
    data: null,
  },
]) {
  test(`${scenario.path}: 실패는 빈 목록이나 스피너가 아닌 재시도 화면을 보여준다`, async ({
    page,
  }) => {
    let attempts = 0;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem("leave.token", "query-state-fixture"),
    );
    await page.route("http://localhost:8787/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown;
      let status = 200;
      if (path === scenario.endpoint) {
        attempts++;
        if (attempts === 1 || !scenario.data) {
          status = 403;
          body = { error: "테스트 요청 거부", code: "FORBIDDEN" };
        } else body = scenario.data;
      } else if (path === "/auth/bootstrap") {
        body = {
          onboarding: {
            completed: true,
            emailVerified: true,
            email: user.email,
            username: user.username,
            profile: null,
            regularOvernight: null,
            unitId: null,
          },
          me,
        };
      } else if (path === "/auth/me") body = me;
      else if (path === "/notifications/summary") body = { unreadCount: 0 };
      else if (path === "/leaves/balances") body = { balances: [] };
      else body = { leaves: [], notifications: [], unreadCount: 0 };
      await route.fulfill({ status, json: body });
    });
    await page.goto(scenario.path);
    await expect(page.getByRole("alert")).toContainText(scenario.error);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const targets = await page
      .locator(".app-nav-item, .app-profile-link")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        }),
      );
    expect(targets.length).toBeGreaterThan(0);
    for (const bounds of targets) {
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    if (scenario.empty)
      await expect(page.getByText(scenario.empty)).toHaveCount(0);
    await expect(page.getByRole("status", { name: "불러오는 중" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "다시 불러오기" }).click();
    await expect.poll(() => attempts).toBe(2);
    if (scenario.empty) {
      await expect(page.getByText(scenario.empty)).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    } else await expect(page.getByRole("alert")).toContainText(scenario.error);
    expect(pageErrors).toEqual([]);
  });
}
