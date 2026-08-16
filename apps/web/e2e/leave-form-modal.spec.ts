import { expect, test } from "@playwright/test";

/**
 * 화면 기준으로 떠야 하는 UI(모달·토스트)의 배치 e2e.
 *
 * 지키려는 것: 이들은 언제나 **화면(뷰포트)** 기준으로 뜬다. 페이지가 길어져도
 * 저장 버튼이 화면 밖으로 밀려나면 안 된다 — 모달이 열린 동안 배경 스크롤을
 * 잠그므로, 한 번 밀려나면 버튼에 영영 닿을 수 없다.
 *
 * 이 테스트가 잡는 회귀: 이들을 페이지 트리 안에 그대로 두면, 조상 중 하나라도
 * transform이 걸린 순간(예: `animation-fill-mode: both`가 남기는 `translateY(0)`)
 * `position: fixed`의 기준이 뷰포트가 아니라 그 조상이 된다.
 */

/** 계정·부대·휴가 여러 건을 만들고 토큰을 돌려준다. 목록이 길어야 재현된다. */
async function seedLongLeaveList(
  request: import("@playwright/test").APIRequestContext,
) {
  const email = `modal-e2e-${Date.now()}@test.com`;
  const signup = await request.post("http://localhost:8787/auth/signup", {
    data: {
      email,
      password: "password123",
      name: "모달테스터",
      branch: "air_force",
      enlistedAt: "2026-03-23",
      dischargeAt: "2027-12-22",
      rank: "private",
      dataConsent: true,
    },
  });
  expect(signup.ok()).toBeTruthy();
  const { token } = (await signup.json()) as { token: string };

  const unit = await request.post("http://localhost:8787/units", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `모달부대-${Date.now()}`, maxLeaveCount: 5 },
  });
  expect(unit.ok()).toBeTruthy();

  const ranges = [
    ["2026-09-01", "2026-09-05"],
    ["2026-10-01", "2026-10-03"],
    ["2026-10-10", "2026-10-12"],
    ["2026-10-20", "2026-10-22"],
    ["2026-11-01", "2026-11-03"],
    ["2026-11-10", "2026-11-12"],
  ] as const;
  for (const [startDate, endDate] of ranges) {
    const created = await request.post("http://localhost:8787/leaves", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: `휴가 ${startDate}`,
        segments: [{ category: "annual", startDate, endDate }],
      },
    });
    expect(created.ok()).toBeTruthy();
  }
  return token;
}

test("목록이 길어도 휴가 수정 모달의 저장 버튼이 화면 안에 있다", async ({
  page,
  request,
}) => {
  const token = await seedLongLeaveList(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);

  await page.goto("/leaves");
  await page.getByRole("button", { name: "수정" }).first().click();

  const dialog = page.getByRole("dialog", { name: "휴가 수정" });
  await expect(dialog).toBeVisible();

  // 배경(오버레이)은 화면 전체를 덮어야 한다. 페이지 칸만 덮고 있다면 fixed의
  // 기준이 뷰포트가 아니라는 뜻이고, 그때 모달은 화면 밖으로 밀려난다.
  const overlay = page.locator('[role="presentation"]').filter({ has: dialog });
  const overlayBox = await overlay.boundingBox();
  expect(overlayBox?.width).toBe(1440);
  expect(overlayBox?.height).toBe(900);

  // 모달 자체가 화면 안에 들어와 있어야 한다. 배경 스크롤이 잠겨 있으므로
  // 화면 밖으로 걸친 부분은 어떤 방법으로도 볼 수 없다.
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(900);

  // 폼이 길면 모달 안에서 스크롤해 내려가고, 그렇게 하면 저장 버튼에 닿는다.
  const submit = dialog.getByRole("button", { name: "변경사항 저장" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await expect(submit).toBeEnabled();
});

test("모달 안에서 시작한 드래그를 배경에서 놓아도 모달이 닫히지 않는다", async ({
  page,
  request,
}) => {
  const token = await seedLongLeaveList(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);

  await page.goto("/leaves");
  await page.getByRole("button", { name: "수정" }).first().click();

  const dialog = page.getByRole("dialog", { name: "휴가 수정" });
  await expect(dialog).toBeVisible();

  const title = dialog.getByPlaceholder("예: 제주도 가족여행");
  const titleBox = (await title.boundingBox())!;
  const dialogBox = (await dialog.boundingBox())!;

  // 제목 입력의 글자를 끌다가 손이 모달 왼쪽 배경으로 빠진 뒤 거기서 놓는다.
  // click의 target은 누른 곳과 뗀 곳의 공통 조상(=배경)이라, 배경 클릭만 보고
  // 닫으면 여기서 닫혀 버린다. 입력하던 내용이 통째로 날아가는 회귀.
  await page.mouse.move(titleBox.x + 20, titleBox.y + titleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBox.x + 120, titleBox.y + titleBox.height / 2);
  await page.mouse.move(dialogBox.x / 2, dialogBox.y + dialogBox.height / 2);
  await page.mouse.up();

  await expect(dialog).toBeVisible();

  // 반대로 배경에서 눌러 모달 안에서 놓는 경우도 닫히면 안 된다.
  await page.mouse.move(dialogBox.x / 2, dialogBox.y + dialogBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBox.x + 20, titleBox.y + titleBox.height / 2);
  await page.mouse.up();

  await expect(dialog).toBeVisible();

  // 배경을 그냥 누르고 떼면 예전처럼 닫혀야 한다.
  await page.mouse.click(dialogBox.x / 2, dialogBox.y + dialogBox.height / 2);
  await expect(dialog).toBeHidden();
});

test("데스크톱에서 휴가 수정 모달이 모바일 폭보다 넓게 열린다", async ({
  page,
  request,
}) => {
  const token = await seedLongLeaveList(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, token);

  await page.goto("/leaves");
  await page.getByRole("button", { name: "수정" }).first().click();

  const dialog = page.getByRole("dialog", { name: "휴가 수정" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width).toBeGreaterThan(600);
});

test("초과 등록 토스트가 페이지가 아니라 화면 아래에 붙는다", async ({
  page,
  request,
}) => {
  // 토스트는 같은 날 최대 출타 인원을 넘겼을 때만 뜬다. 정원 1명짜리 그룹에
  // 다른 부대원이 오늘 이미 나가 있게 만들고, 내가 오늘로 하나 더 등록한다.
  const api = "http://localhost:8787";
  const signup = async (tag: string) => {
    const res = await request.post(`${api}/auth/signup`, {
      data: {
        email: `toast-e2e-${tag}-${Date.now()}@test.com`,
        password: "password123",
        name: `토스트${tag}`,
        branch: "air_force",
        enlistedAt: "2026-03-23",
        dischargeAt: "2027-12-22",
        rank: "private",
        dataConsent: true,
      },
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { token: string }).token;
  };
  const other = await signup("A");
  const mine = await signup("B");

  const unitRes = await request.post(`${api}/units`, {
    headers: { Authorization: `Bearer ${other}` },
    data: { name: `토스트부대-${Date.now()}`, maxLeaveCount: 1 },
  });
  expect(unitRes.ok()).toBeTruthy();
  const unitId = ((await unitRes.json()) as { unit: { id: string } }).unit.id;

  const inviteRes = await request.post(`${api}/units/${unitId}/invite`, {
    headers: { Authorization: `Bearer ${other}` },
    data: {},
  });
  expect(inviteRes.ok()).toBeTruthy();
  const code = ((await inviteRes.json()) as { invite: { code: string } }).invite
    .code;
  const joinRes = await request.post(`${api}/units/join`, {
    headers: { Authorization: `Bearer ${mine}` },
    data: { code },
  });
  expect(joinRes.ok()).toBeTruthy();

  // 폼이 기본으로 여는 날짜와 같아야 하므로 서울 기준 오늘로 맞춘다.
  const today = new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const otherLeave = await request.post(`${api}/leaves`, {
    headers: { Authorization: `Bearer ${other}` },
    data: {
      title: "선점 휴가",
      segments: [{ category: "annual", startDate: today, endDate: today }],
    },
  });
  expect(otherLeave.ok()).toBeTruthy();

  // 페이지가 화면보다 확실히 길어야 "페이지에 붙었는지 화면에 붙었는지"가 갈린다.
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.addInitScript((value) => {
    localStorage.setItem("leave.token", value);
  }, mine);

  await page.goto("/calendar");
  await page.getByRole("button", { name: "휴가 등록" }).click();
  const dialog = page.getByRole("dialog", { name: "휴가 등록" });
  await dialog.getByPlaceholder("예: 제주도 가족여행").fill("초과 테스트");
  await dialog.getByRole("button", { name: "휴가 등록" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toContainText("최대 출타 인원을 초과해요");
  await expect(toast).toBeInViewport();

  // 화면 아래에 붙어야 한다. 페이지 칸을 기준으로 잡히면 페이지가 길수록
  // 화면 밖으로 내려가 보이지 않는다.
  const box = await toast.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  expect(box!.y + box!.height).toBeGreaterThan(540);

  // 화면에 붙었다는 말은 스크롤해도 제자리라는 뜻이다.
  await page.mouse.wheel(0, 300);
  await expect(toast).toBeInViewport();
  const afterScroll = await toast.boundingBox();
  expect(Math.round(afterScroll!.y)).toBe(Math.round(box!.y));
});
