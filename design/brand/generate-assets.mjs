import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const iconPng = await fs.readFile(path.join(here, "leave-icon.png"));
const markPng = await fs.readFile(path.join(here, "leave-mark.png"));

const dataUri = (png) => `data:image/png;base64,${png.toString("base64")}`;

async function render(
  page,
  {
    png,
    output,
    size,
    inset = 0,
    background = "transparent",
    radius = 0,
    filter = "none",
  },
) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }
      .canvas {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: ${background};
        border-radius: ${radius}px;
      }
      img {
        display: block;
        width: ${100 - inset * 2}%;
        height: ${100 - inset * 2}%;
        filter: ${filter};
      }
    </style>
    <div class="canvas"><img src="${dataUri(png)}" /></div>`,
    { waitUntil: "load" },
  );
  const target = path.join(root, output);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await page.screenshot({
    path: target,
    omitBackground: background === "transparent",
  });
  console.log(`✓ ${output} (${size}x${size})`);
}

const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ deviceScaleFactor: 1 });

try {
  await render(page, {
    png: iconPng,
    output: "apps/native/assets/images/leave-icon.png",
    size: 1024,
  });
  await render(page, {
    png: markPng,
    output: "apps/native/assets/images/leave-adaptive-foreground.png",
    size: 1024,
    inset: 18,
  });
  await render(page, {
    png: markPng,
    output: "apps/native/assets/images/leave-monochrome.png",
    size: 1024,
    inset: 18,
    filter: "brightness(0) invert(1)",
  });
  await render(page, {
    png: iconPng,
    output: "apps/native/assets/images/leave-splash.png",
    size: 1024,
    inset: 18,
    radius: 192,
  });
  await render(page, {
    png: markPng,
    output: "apps/native/assets/images/leave-notification.png",
    size: 96,
    inset: 12,
    filter: "brightness(0) invert(1)",
  });

  await render(page, {
    png: iconPng,
    output: "apps/web/public/apple-touch-icon.png",
    size: 180,
  });
  await render(page, {
    png: iconPng,
    output: "apps/web/public/icon-192.png",
    size: 192,
  });
  await render(page, {
    png: iconPng,
    output: "apps/web/public/icon-512.png",
    size: 512,
  });

  await fs.mkdir(path.join(root, "apps/web/public/brand"), {
    recursive: true,
  });
  await fs.copyFile(
    path.join(here, "leave-icon.png"),
    path.join(root, "apps/web/public/brand/leave-icon.png"),
  );
  console.log("✓ apps/web/public/brand/leave-icon.png");
} finally {
  await browser.close();
}
