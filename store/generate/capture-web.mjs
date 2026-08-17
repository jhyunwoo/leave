// 아이패드 스토어 슬라이드에 쓸 **웹 데스크탑 뷰** 캡처.
//
// 아이패드용 실기기 캡처가 없어 예전에는 가상 데이터 합성 화면(screens.mjs)을 썼다.
// 이제는 실제로 동작하는 웹 앱을 데스크탑 폭으로 띄워 그대로 찍는다.
//
// 선행 조건:
//   1) 로컬 API(8787)와 웹(5173)이 떠 있어야 한다.
//   2) `node seed-web.mjs`로 데모 데이터를 넣어야 한다 (.seed-session.json 생성).
//
// 실행: node capture-web.mjs
// 결과: store/assets/web/*.png — 원본으로 보관하고, 잘라내기·합성은 ipad.mjs에서만 한다.

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const WEB = process.env.CAPTURE_WEB_URL || "http://localhost:5173";
const OUT = path.resolve(__dirname, "..", "assets", "web");
const SESSION_FILE = path.join(__dirname, ".seed-session.json");

if (!fs.existsSync(SESSION_FILE)) {
  console.error(`세션 파일이 없습니다: ${SESSION_FILE}\n먼저 'node seed-web.mjs'를 실행하세요.`);
  process.exit(1);
}
const session = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
/** 달력에서 미리 선택해둘 날짜 — 출타 인원이 상한을 넘긴 날이라 우측 패널이 채워진다. */
const BUSY_DAY = 22;

function findChromium() {
  return [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
    (candidate) => candidate && fs.existsSync(candidate),
  );
}

async function save(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  const size = page.viewportSize();
  console.log("✓", path.relative(ROOT, file), `${size.width}x${size.height}`);
}

/**
 * 뷰포트마다 컨텍스트를 새로 연다. Playwright는 컨텍스트 생성 시점의 뷰포트로
 * 레이아웃을 잡는 편이 안정적이고, 로그인 여부(랜딩)도 컨텍스트 단위로 갈린다.
 */
async function openContext(browser, { width, height, token }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
    // 캡처마다 애니메이션 잔상이 다르게 남지 않도록 모션을 끈다.
    reducedMotion: "reduce",
  });
  if (token) {
    await context.addInitScript((value) => {
      window.localStorage.setItem("leave.token", value);
    }, token);
  }
  const page = await context.newPage();
  return { context, page };
}

/** `2026-08` → `2026년 8월` (CalendarScroll의 월 라벨 형식). */
const MONTH_LABEL = (() => {
  const [y, m] = session.month.split("-");
  return `${y}년 ${Number(m)}월`;
})();

/** 라벨로 특정 달의 `<section class="cal-month-block">`을 집는다. */
function monthBlock(page, label) {
  return page
    .locator("section.cal-month-block")
    .filter({ has: page.locator("h3.cal-month-label", { hasText: label }) });
}

/**
 * 기준월이 스크롤 영역 맨 위에 오도록 맞춘다.
 *
 * 달은 위아래 sentinel로 지연 로딩되므로 (1) 해당 달이 DOM에 나타날 때까지 스크롤을
 * 내리고 (2) 정렬한 뒤 (3) 새 달이 위에 붙어 밀린 만큼 다시 정렬한다.
 */
async function scrollToMonth(page, label) {
  const align = () =>
    page.evaluate((text) => {
      const scroller = document.querySelector(".cal-scroll");
      const target = [...document.querySelectorAll("section.cal-month-block")].find((s) =>
        s.querySelector("h3.cal-month-label")?.textContent?.includes(text),
      );
      if (!target) return false;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
        scroller.scrollTop +=
          target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      } else {
        window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top, behavior: "auto" });
      }
      return true;
    }, label);

  for (let i = 0; i < 24; i += 1) {
    if (await align()) break;
    await page.evaluate(() => {
      const scroller = document.querySelector(".cal-scroll");
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
        scroller.scrollTop += scroller.clientHeight;
      } else {
        window.scrollBy(0, window.innerHeight);
      }
    });
    await page.waitForTimeout(350);
  }
  // 정렬 뒤에도 위쪽에 달이 더 붙으면 밀리므로 몇 번 더 맞춘다.
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(400);
    await align();
  }
  await page.waitForTimeout(400);
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // 진입 애니메이션(global.css의 anim-rise 등)이 끝난 뒤에 찍는다.
  await page.waitForTimeout(900);
}

async function run() {
  const executablePath = findChromium();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--force-color-profile=srgb", "--disable-dev-shm-usage"],
  });

  // ── 1. 공유 휴가 달력 (2단 데스크탑 레이아웃) ────────────────
  {
    const { context, page } = await openContext(browser, {
      width: 1440,
      height: 1080,
      token: session.token,
    });
    await page.goto(`${WEB}/`);
    await settle(page);
    // 달력은 여러 달을 잇는 무한 스크롤이고, 위아래로 달이 더 붙으면서 스크롤 위치가
    // 밀린다. "오늘" 버튼만으로는 기준월에 안착하지 않으므로 직접 맞춘다.
    await scrollToMonth(page, MONTH_LABEL);
    // 출타 인원이 상한을 넘긴 날을 눌러 우측 상세 패널(출타 명단)을 채운다.
    await monthBlock(page, MONTH_LABEL)
      .getByRole("gridcell", { name: new RegExp(`^${BUSY_DAY}일,`) })
      .first()
      .click();
    await page.waitForTimeout(900);
    await scrollToMonth(page, MONTH_LABEL);
    await save(page, "calendar");
    await context.close();
  }

  // ── 2. 내 휴가 (재원별 잔여) ─────────────────────────────────
  {
    const { context, page } = await openContext(browser, {
      width: 1120,
      height: 1000,
      token: session.token,
    });
    await page.goto(`${WEB}/leaves`);
    await settle(page);
    await save(page, "leaves");
    await context.close();
  }

  // ── 3. 보유 휴가 (적립분·만기 자동 차감) ─────────────────────
  {
    const { context, page } = await openContext(browser, {
      width: 1120,
      height: 1000,
      token: session.token,
    });
    await page.goto(`${WEB}/leaves/grants`);
    await settle(page);
    await save(page, "grants");
    await context.close();
  }

  // ── 4. 랜딩 (비로그인) ───────────────────────────────────────
  {
    const { context, page } = await openContext(browser, { width: 1440, height: 1000 });
    await page.goto(`${WEB}/`);
    await settle(page);
    // 랜딩 히어로는 진입 애니메이션이 있다. fill-mode가 남긴 transform이
    // 레이아웃을 흔들 수 있어, 애니메이션이 모두 끝난 뒤에 찍는다.
    await page.evaluate(async () => {
      await Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      );
    });
    await page.waitForTimeout(400);
    await save(page, "landing");
    await context.close();
  }

  await browser.close();
  console.log(`\n완료: ${path.relative(ROOT, OUT)} 에 저장했습니다.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
