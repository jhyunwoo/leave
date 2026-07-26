import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const source = await fs.readFile(
  path.join(here, "leave-icon-imagegen-source.png"),
);
const sourceUri = `data:image/png;base64,${source.toString("base64")}`;

const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
const page = await browser.newPage();

try {
  const normalized = await page.evaluate(async (uri) => {
    const image = new Image();
    image.src = uri;
    await image.decode();

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) throw new Error("2D canvas is unavailable");
    sourceContext.drawImage(image, 0, 0);

    const sourcePixels = sourceContext.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
    ).data;
    let minX = sourceCanvas.width;
    let minY = sourceCanvas.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        const index = (y * sourceCanvas.width + x) * 4;
        const luminance =
          sourcePixels[index] * 0.2126 +
          sourcePixels[index + 1] * 0.7152 +
          sourcePixels[index + 2] * 0.0722;
        if (luminance < 90) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const markWidth = maxX - minX + 1;
    const markHeight = maxY - minY + 1;
    const cropSize = Math.ceil(Math.max(markWidth, markHeight) / 0.66);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const cropX = Math.max(
      0,
      Math.min(
        sourceCanvas.width - cropSize,
        Math.round(centerX - cropSize / 2),
      ),
    );
    const cropY = Math.max(
      0,
      Math.min(
        sourceCanvas.height - cropSize,
        Math.round(centerY - cropSize / 2),
      ),
    );

    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas is unavailable");
    context.drawImage(
      image,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      size,
      size,
    );

    const pixels = context.getImageData(0, 0, size, size);
    const markCanvas = document.createElement("canvas");
    markCanvas.width = size;
    markCanvas.height = size;
    const markContext = markCanvas.getContext("2d");
    if (!markContext) throw new Error("2D canvas is unavailable");
    const markPixels = markContext.createImageData(size, size);
    const background = [159, 232, 112];
    const foreground = [14, 15, 12];

    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const backgroundDistance = Math.hypot(
        red - background[0],
        green - background[1],
        blue - background[2],
      );
      const foregroundDistance = Math.hypot(
        red - foreground[0],
        green - foreground[1],
        blue - foreground[2],
      );
      const ratio =
        backgroundDistance / (backgroundDistance + foregroundDistance);
      const linear = Math.max(0, Math.min(1, (ratio - 0.22) / 0.56));
      const alpha = linear * linear * (3 - 2 * linear);

      for (let channel = 0; channel < 3; channel += 1) {
        pixels.data[index + channel] = Math.round(
          background[channel] * (1 - alpha) + foreground[channel] * alpha,
        );
        markPixels.data[index + channel] = foreground[channel];
      }
      pixels.data[index + 3] = 255;
      markPixels.data[index + 3] = Math.round(alpha * 255);
    }

    context.putImageData(pixels, 0, 0);
    markContext.putImageData(markPixels, 0, 0);

    return {
      icon: canvas.toDataURL("image/png"),
      mark: markCanvas.toDataURL("image/png"),
      crop: { cropX, cropY, cropSize, minX, minY, maxX, maxY },
    };
  }, sourceUri);

  const decode = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
  await fs.writeFile(
    path.join(here, "leave-icon.png"),
    decode(normalized.icon),
  );
  await fs.writeFile(
    path.join(here, "leave-mark.png"),
    decode(normalized.mark),
  );
  console.log("✓ design/brand/leave-icon.png");
  console.log("✓ design/brand/leave-mark.png");
  console.log("  crop", normalized.crop);
} finally {
  await browser.close();
}
