import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PRETENDARD_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2";
const PRETENDARD_SHA256 =
  "9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4";
const INTER_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.8/files/inter-latin-wght-normal.woff2";
const INTER_SHA256 =
  "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "../..");
const outputDir = join(webRoot, "public/fonts");
const sourceRoots = [
  join(webRoot, "src"),
  join(repoRoot, "packages/client/src"),
  join(repoRoot, "packages/shared/src"),
];

function collectTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
    });
}

function collectStaticText() {
  let text = "";

  for (const path of sourceRoots.flatMap(collectTypeScriptFiles)) {
    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node) => {
      if (
        ts.isStringLiteralLike(node) ||
        ts.isJsxText(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        text += `${node.text}\n`;
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  const basicLatin = Array.from({ length: 95 }, (_, index) =>
    String.fromCodePoint(index + 32),
  ).join("");
  return `${text}\n${basicLatin}`;
}

async function download(url, expectedHash, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha256").update(body).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(
      `Upstream hash mismatch for ${url}: expected ${expectedHash}, received ${actualHash}`,
    );
  }
  writeFileSync(outputPath, body);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "leave-fonts-"));

try {
  const sourceFont = join(temporaryDirectory, "PretendardVariable.woff2");
  const staticText = join(temporaryDirectory, "static-text.txt");
  const subsetFont = join(temporaryDirectory, "pretendard-ui-v1.3.9.woff2");
  const interFont = join(temporaryDirectory, "inter-latin-v5.2.8.woff2");

  await Promise.all([
    download(PRETENDARD_URL, PRETENDARD_SHA256, sourceFont),
    download(INTER_URL, INTER_SHA256, interFont),
  ]);
  writeFileSync(staticText, collectStaticText());

  execFileSync(
    "uv",
    [
      "tool",
      "run",
      "--from",
      "fonttools[woff]==4.63.0",
      "pyftsubset",
      sourceFont,
      `--text-file=${staticText}`,
      `--output-file=${subsetFont}`,
      "--flavor=woff2",
      "--layout-features=*",
      "--no-hinting",
      "--name-IDs=*",
      "--name-languages=*",
      "--notdef-glyph",
      "--recommended-glyphs",
      "--glyph-names",
      "--symbol-cmap",
      "--legacy-cmap",
    ],
    { stdio: "inherit" },
  );

  copyFileSync(subsetFont, join(outputDir, "pretendard-ui-v1.3.9.woff2"));
  copyFileSync(interFont, join(outputDir, "inter-latin-v5.2.8.woff2"));

  for (const file of [
    "pretendard-ui-v1.3.9.woff2",
    "inter-latin-v5.2.8.woff2",
  ]) {
    const body = readFileSync(join(outputDir, file));
    const hash = createHash("sha256").update(body).digest("hex");
    console.log(`${hash}  ${file}`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
