import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

async function seedCalendarUser(request: APIRequestContext): Promise<string> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signup = await request.post("http://localhost:8787/auth/signup", {
    data: {
      email: `calendar-window-${unique}@test.com`,
      password: "password123",
      name: "달력테스터",
      branch: "air_force",
      enlistedAt: "2024-01-01",
      dischargeAt: "2029-12-31",
      rank: "private",
      dataConsent: true,
    },
  });
  expect(signup.ok()).toBeTruthy();
  const { token } = (await signup.json()) as { token: string };

  const unit = await request.post("http://localhost:8787/units", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `달력부대-${unique}`, maxLeaveCount: 5 },
  });
  expect(unit.ok()).toBeTruthy();
  return token;
}

async function monthLabels(page: Page): Promise<string[]> {
  return page.locator(".cal-month-label").allTextContents();
}

async function focusCalendarDay(
  page: Page,
  monthLabel: string,
  dayIndex: number,
) {
  const month = page.locator(".cal-month-block").filter({
    has: page.getByRole("heading", { name: monthLabel, exact: true }),
  });
  const cell = month.locator(".cal-cell:not(:disabled)").nth(dayIndex);

  // Month labels commit synchronously with a window transition, while their
  // query-backed grids can still be showing a loading placeholder. Wait for
  // the actual focusable source cell instead of treating the label as ready.
  await expect(cell).toBeEnabled();
  await cell.evaluate((element) => element.focus({ preventScroll: true }));
  await expect(cell).toBeFocused();
}

async function focusCalendarMonthSection(page: Page, monthLabel: string) {
  const focused = await page
    .locator(".cal-scroll")
    .evaluate((scroller, label) => {
      const month = Array.from(
        scroller.querySelectorAll<HTMLElement>(".cal-month-block"),
      ).find(
        (block) =>
          block.querySelector(".cal-month-label")?.textContent === label,
      );
      if (!month) return false;
      month.tabIndex = -1;
      month.focus({ preventScroll: true });
      return document.activeElement === month;
    }, monthLabel);
  expect(focused).toBeTruthy();
}

async function focusedCalendarDay(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const month = active?.closest(".cal-month-block");
    return {
      monthLabel: month?.querySelector(".cal-month-label")?.textContent ?? null,
      day: active?.querySelector(".cal-daynum")?.textContent ?? null,
    };
  });
}

async function moveWindow(
  page: Page,
  direction: "older" | "newer",
  pageScroll: boolean,
) {
  const transition = await page.locator(".cal-scroll").evaluate(
    async (scroller, options) => {
      const blocks = Array.from(
        scroller.querySelectorAll<HTMLElement>(".cal-month-block"),
      );
      const beforeLabels = blocks.map(
        (block) => block.querySelector(".cal-month-label")?.textContent ?? "",
      );

      if (options.pageScroll) {
        const target =
          options.direction === "older"
            ? window.scrollY + scroller.getBoundingClientRect().top
            : document.documentElement.scrollHeight;
        window.scrollTo(0, target);
      } else {
        scroller.scrollTop =
          options.direction === "older" ? 0 : scroller.scrollHeight;
      }

      const anchor =
        options.direction === "older" ? blocks[0] : blocks[blocks.length - 1];
      const anchorLabel =
        anchor?.querySelector(".cal-month-label")?.textContent ?? "";
      const beforeTop = anchor?.getBoundingClientRect().top ?? 0;

      return new Promise<{
        beforeLabels: string[];
        afterLabels: string[];
        beforeTop: number;
        afterTop: number;
      }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error("calendar window did not transition"));
        }, 10_000);
        const observer = new MutationObserver(() => {
          const afterBlocks = Array.from(
            scroller.querySelectorAll<HTMLElement>(".cal-month-block"),
          );
          const afterLabels = afterBlocks.map(
            (block) =>
              block.querySelector(".cal-month-label")?.textContent ?? "",
          );
          if (afterLabels.join("|") === beforeLabels.join("|")) return;

          observer.disconnect();
          window.clearTimeout(timeout);
          const retainedAnchor = afterBlocks.find(
            (block) =>
              block.querySelector(".cal-month-label")?.textContent ===
              anchorLabel,
          );
          resolve({
            beforeLabels,
            afterLabels,
            beforeTop,
            afterTop: retainedAnchor?.getBoundingClientRect().top ?? Number.NaN,
          });
        });
        // Month sections are direct children. Ignoring subtree mutations keeps
        // query placeholder -> grid swaps out of this transition measurement.
        observer.observe(scroller, { childList: true });
      });
    },
    { direction, pageScroll },
  );

  expect(transition.afterLabels).not.toEqual(transition.beforeLabels);
  expect(Number.isFinite(transition.afterTop)).toBeTruthy();
  // Scroll offsets and 1px borders can settle on half pixels at some widths.
  expect(
    Math.abs(transition.afterTop - transition.beforeTop),
  ).toBeLessThanOrEqual(3);
  expect(transition.afterLabels.length).toBeLessThanOrEqual(9);
}

function seoulMonthLabel(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}년 ${month}월`;
}

test("month-window transition stays contiguous and capped", async ({
  page,
}) => {
  await page.goto("/login");
  const result = await page.evaluate(async (modulePath) => {
    const calendar = (await import(/* @vite-ignore */ modulePath)) as {
      CALENDAR_MAX_MONTHS: number;
      CALENDAR_PAGE_SIZE: number;
      transitionCalendarWindow: (
        months: string[],
        direction: "older" | "newer",
        bounds: { earliestMonth: string; latestMonth: string },
      ) => string[];
    };
    const initial = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    const wideBounds = {
      earliestMonth: "2000-01",
      latestMonth: "2100-12",
    };
    const olderOnce = calendar.transitionCalendarWindow(
      initial,
      "older",
      wideBounds,
    );
    const olderTwice = calendar.transitionCalendarWindow(
      olderOnce,
      "older",
      wideBounds,
    );
    const newerOnce = calendar.transitionCalendarWindow(
      initial,
      "newer",
      wideBounds,
    );
    const newerTwice = calendar.transitionCalendarWindow(
      newerOnce,
      "newer",
      wideBounds,
    );
    const nearFutureEdge = [
      "2027-11",
      "2027-12",
      "2028-01",
      "2028-02",
      "2028-03",
      "2028-04",
      "2028-05",
      "2028-06",
      "2028-07",
    ];
    const futureBounds = {
      earliestMonth: "2025-08",
      latestMonth: "2028-08",
    };
    const finalFutureBatch = calendar.transitionCalendarWindow(
      nearFutureEdge,
      "newer",
      futureBounds,
    );
    const atFutureEdge = calendar.transitionCalendarWindow(
      finalFutureBatch,
      "newer",
      futureBounds,
    );
    const nearPastEdge = [
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ];
    const finalPastBatch = calendar.transitionCalendarWindow(
      nearPastEdge,
      "older",
      futureBounds,
    );
    const atPastEdge = calendar.transitionCalendarWindow(
      finalPastBatch,
      "older",
      futureBounds,
    );
    return {
      pageSize: calendar.CALENDAR_PAGE_SIZE,
      maxMonths: calendar.CALENDAR_MAX_MONTHS,
      olderOnce,
      olderTwice,
      newerOnce,
      newerTwice,
      finalFutureBatch,
      futureEdgeReturnsSameArray: atFutureEdge === finalFutureBatch,
      finalPastBatch,
      pastEdgeReturnsSameArray: atPastEdge === finalPastBatch,
      empty: calendar.transitionCalendarWindow([], "older", wideBounds),
    };
  }, "/src/components/calendar/CalendarScroll.tsx");

  expect(result).toEqual({
    pageSize: 3,
    maxMonths: 9,
    olderOnce: [
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ],
    olderTwice: [
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ],
    newerOnce: [
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ],
    newerTwice: [
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
    ],
    finalFutureBatch: [
      "2027-12",
      "2028-01",
      "2028-02",
      "2028-03",
      "2028-04",
      "2028-05",
      "2028-06",
      "2028-07",
      "2028-08",
    ],
    futureEdgeReturnsSameArray: true,
    finalPastBatch: [
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ],
    pastEdgeReturnsSameArray: true,
    empty: [],
  });
});

for (const viewport of [
  { name: "internal", width: 1440, height: 900, pageScroll: false },
  { name: "page", width: 390, height: 844, pageScroll: true },
] as const) {
  test(`${viewport.name} scroll preserves anchors, caps months, and restores today`, async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const token = await seedCalendarUser(request);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.addInitScript((value) => {
      localStorage.setItem("leave.token", value);
    }, token);
    await page.goto("/calendar");
    await expect(
      page.getByRole("heading", { name: "휴가 계획 달력" }),
    ).toBeVisible();
    // Measure the window transition itself, after the page's 240ms entrance
    // transform has finished moving every descendant's viewport coordinates.
    await page.locator(".cal-scroll").evaluate(async (scroller) => {
      const pageRoot = scroller.closest(".anim-rise");
      await Promise.all(
        (pageRoot?.getAnimations() ?? []).map((animation) =>
          animation.finished.catch(() => undefined),
        ),
      );
      await document.fonts.ready;
    });
    await expect(page.locator(".cal-month-loading")).toHaveCount(0);
    const initialCount = (await monthLabels(page)).length;
    // The state always starts with five months. On a short mobile calendar the
    // 600px observer margin can immediately pre-load the next 3-month batch.
    expect(initialCount).toBeGreaterThanOrEqual(5);
    expect(initialCount).toBeLessThanOrEqual(8);

    // Reach a full window. Desktop exercises 5 -> 8 -> 9; a short mobile
    // calendar may already be at 8 due to the intentional observer pre-load.
    while ((await monthLabels(page)).length < 9) {
      await moveWindow(page, "older", viewport.pageScroll);
    }
    expect(await monthLabels(page)).toHaveLength(9);

    // With a full window this appends three and prunes three from the start.
    // A focused date in the removed region hands off to the same day in the
    // nearest retained month instead of falling back to document.body.
    const beforeNewer = await monthLabels(page);
    await focusCalendarDay(page, beforeNewer[0]!, 14);
    await moveWindow(page, "newer", viewport.pageScroll);
    expect(await monthLabels(page)).toHaveLength(9);
    expect(await focusedCalendarDay(page)).toEqual({
      monthLabel: beforeNewer[3],
      day: "15",
    });

    // Exercise the symmetric prepend + end-prune focus handoff as well.
    const beforeOlder = await monthLabels(page);
    await focusCalendarDay(page, beforeOlder[beforeOlder.length - 1]!, 14);
    await moveWindow(page, "older", viewport.pageScroll);
    expect(await focusedCalendarDay(page)).toEqual({
      monthLabel: beforeOlder[beforeOlder.length - 4],
      day: "15",
    });

    // If the retained target was still loading, the first handoff would land
    // on its section. A rapid second prune must carry that focus forward too.
    const beforeLoadingFallback = await monthLabels(page);
    await focusCalendarMonthSection(
      page,
      beforeLoadingFallback[beforeLoadingFallback.length - 1]!,
    );
    await moveWindow(page, "older", viewport.pageScroll);
    expect(await focusedCalendarDay(page)).toEqual({
      monthLabel: beforeLoadingFallback[beforeLoadingFallback.length - 4],
      day: "1",
    });

    // Move far enough into the past that the current month is actually pruned;
    // the exact count differs if mobile pre-loaded one newer batch initially.
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!(await monthLabels(page)).includes(seoulMonthLabel())) break;
      await moveWindow(page, "older", viewport.pageScroll);
    }
    expect(await monthLabels(page)).not.toContain(seoulMonthLabel());

    await page.getByRole("button", { name: "오늘", exact: true }).click();
    await expect.poll(() => monthLabels(page)).toContain(seoulMonthLabel());
    expect((await monthLabels(page)).length).toBeLessThanOrEqual(8);

    const alignment = await page.locator(".cal-scroll").evaluate(
      (scroller, options) => {
        const block = Array.from(
          scroller.querySelectorAll<HTMLElement>(".cal-month-block"),
        ).find(
          (item) =>
            item.querySelector(".cal-month-label")?.textContent ===
            options.label,
        );
        const weekdays = document.querySelector<HTMLElement>(".cal-weekdays");
        const targetTop = options.pageScroll
          ? (weekdays?.getBoundingClientRect().bottom ?? 0)
          : scroller.getBoundingClientRect().top;
        return Math.abs((block?.getBoundingClientRect().top ?? 0) - targetTop);
      },
      { label: seoulMonthLabel(), pageScroll: viewport.pageScroll },
    );
    expect(alignment).toBeLessThanOrEqual(2);
  });
}
