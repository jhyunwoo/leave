import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { handleSafe } from "./helpers";

const API = "http://localhost:8787";

function yearsFromToday(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

async function seedProfileUser(request: APIRequestContext): Promise<string> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      email: `profile-progress-${unique}@test.com`,
      password: "password123",
      name: "복무율테스터",
      branch: "air_force",
      enlistedAt: yearsFromToday(-1),
      dischargeAt: yearsFromToday(1),
      rank: "private",
      dataConsent: true,
    },
  });
  expect(signup.ok()).toBeTruthy();
  const { token } = (await signup.json()) as { token: string };
  const username = await request.put(`${API}/users/me/username`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { username: handleSafe("progress") },
  });
  expect(username.ok()).toBeTruthy();
  return token;
}

async function waitForFrames(page: Page, count: number) {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const step = () => {
          seen += 1;
          if (seen >= frameCount) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

test("프로필 복무율은 열 자리로 흐르고 불필요할 때 멈춘다", async ({
  page,
  request,
}) => {
  const token = await seedProfileUser(request);
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);
  await page.goto("/profile");

  const label = page.getByTestId("profile-service-progress");
  const value = page.getByTestId("profile-service-progress-value");
  const caption = page.getByTestId("profile-service-progress-caption");
  const progressbar = page.getByRole("progressbar", {
    name: "복무 진행률",
  });

  await expect(label).toHaveText(/^복무 \d{1,3}\.\d{10}%$/);
  await expect(progressbar).toHaveAttribute(
    "aria-valuetext",
    /^복무 \d+\.\d%$/,
  );

  const first = await value.textContent();
  await expect.poll(() => value.textContent()).not.toBe(first);

  const activeSample = await value.evaluate(async (element) => {
    await document.fonts.ready;
    const before = element.textContent ?? "";
    const beforeRect = element.getBoundingClientRect();
    const mutationTypes: string[] = [];
    const observer = new MutationObserver((records) => {
      mutationTypes.push(...records.map((record) => record.type));
    });
    observer.observe(element, { characterData: true, subtree: true });

    await new Promise<void>((resolve) => {
      let frames = 0;
      const step = () => {
        frames += 1;
        if (frames >= 8) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    observer.disconnect();
    const afterRect = element.getBoundingClientRect();
    return {
      before,
      after: element.textContent ?? "",
      widthDelta: Math.abs(afterRect.width - beforeRect.width),
      heightDelta: Math.abs(afterRect.height - beforeRect.height),
      mutationTypes,
    };
  });

  expect(Number.parseFloat(activeSample.after)).toBeGreaterThan(
    Number.parseFloat(activeSample.before),
  );
  expect(activeSample.widthDelta).toBeLessThanOrEqual(0.01);
  expect(activeSample.heightDelta).toBeLessThanOrEqual(0.01);
  expect(activeSample.mutationTypes.length).toBeGreaterThan(0);
  expect(new Set(activeSample.mutationTypes)).toEqual(
    new Set(["characterData"]),
  );

  await label.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const observer = new IntersectionObserver(([entry]) => {
          if (entry?.isIntersecting) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(element);
        window.scrollTo(0, document.documentElement.scrollHeight);
      }),
  );
  await waitForFrames(page, 2);
  const stopped = await value.textContent();
  await waitForFrames(page, 8);
  await expect(value).toHaveText(stopped ?? "");

  await label.scrollIntoViewIfNeeded();
  await expect.poll(() => value.textContent()).not.toBe(stopped);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(label).toHaveText(/^복무 \d{1,3}\.\d%$/);
  const reduced = await value.textContent();
  await waitForFrames(page, 8);
  await expect(value).toHaveText(reduced ?? "");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await label.scrollIntoViewIfNeeded();
  await expect(label).toHaveText(/^복무 \d{1,3}\.\d{10}%$/);

  const [labelBox, captionBox] = await Promise.all([
    label.boundingBox(),
    caption.boundingBox(),
  ]);
  expect(labelBox).not.toBeNull();
  expect(captionBox).not.toBeNull();
  if (labelBox && captionBox) {
    const overlaps = !(
      labelBox.x + labelBox.width <= captionBox.x ||
      captionBox.x + captionBox.width <= labelBox.x ||
      labelBox.y + labelBox.height <= captionBox.y ||
      captionBox.y + captionBox.height <= labelBox.y
    );
    expect(overlaps).toBeFalsy();
  }
});
