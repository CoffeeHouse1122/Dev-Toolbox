const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const JSZip = require("jszip");

const { processSvgFiles } = require("../dist/electron/main/services/svg.service.js");
const { generatePwaIconPackages } = require("../dist/electron/main/services/pwa-icon.service.js");

function createHistory() {
  const starts = [];
  const finishes = [];
  return {
    starts,
    finishes,
    async startTask(value) { starts.push(value); },
    async finishTask(...value) { finishes.push(value); }
  };
}

async function withSvgTempDir(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-svg-"));
  try {
    return await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const validSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10">
    <rect id="background" width="20" height="10" fill="#12a4a6" />
  </svg>
`;

test("SVG batch preserves Unicode names and reports unsafe items as partial", async () => {
  await withSvgTempDir(async (directory) => {
    const valid = path.join(directory, "中文 图标.svg");
    const unsafe = path.join(directory, "unsafe.svg");
    const outputDir = path.join(directory, "output");
    await fs.writeFile(valid, validSvg);
    await fs.writeFile(unsafe, `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);

    const history = createHistory();
    const result = await processSvgFiles(
      {
        inputPaths: [unsafe, valid],
        outputDir,
        outputFormat: "svg",
        precision: 2,
        removeDimensions: false,
        cleanupIds: true
      },
      history
    );

    assert.equal(result.status, "partial");
    assert.deepEqual(result.items.map((item) => item.status), ["error", "success"]);
    assert.match(result.items[0].errorMessage, /scripts are not allowed/i);
    assert.equal(path.basename(result.files[0]), "中文 图标-optimized.svg");
    assert.doesNotMatch(await fs.readFile(result.files[0], "utf8"), /<script/i);
    assert.equal(history.finishes.at(-1)[1], "partial");
  });
});

test("SVG outputs never overwrite an existing file and leave no temporary artifact", async () => {
  await withSvgTempDir(async (directory) => {
    const input = path.join(directory, "图标.svg");
    const outputDir = path.join(directory, "output");
    const existing = path.join(outputDir, "图标-optimized.svg");
    await fs.mkdir(outputDir);
    await fs.writeFile(input, validSvg);
    await fs.writeFile(existing, "keep-existing");

    const result = await processSvgFiles(
      { inputPaths: [input], outputDir, outputFormat: "svg" },
      createHistory()
    );

    assert.equal(result.status, "success");
    assert.equal(path.basename(result.files[0]), "图标-optimized-2.svg");
    assert.equal(await fs.readFile(existing, "utf8"), "keep-existing");
    assert.deepEqual((await fs.readdir(outputDir)).filter((name) => name.includes(".part-")), []);
  });
});

test("SVG options preserve IDs when requested and convert fixed dimensions to viewBox sizing", async () => {
  await withSvgTempDir(async (directory) => {
    const input = path.join(directory, "options.svg");
    await fs.writeFile(input, validSvg);

    const result = await processSvgFiles(
      {
        inputPaths: [input],
        outputDir: path.join(directory, "output"),
        outputFormat: "svg",
        precision: 2,
        cleanupIds: false,
        removeDimensions: true
      },
      createHistory()
    );

    assert.equal(result.status, "success");
    const output = await fs.readFile(result.files[0], "utf8");
    assert.match(output, /id="background"/);
    assert.match(output, /viewBox="0 0 20 10"/);
    assert.doesNotMatch(output, /\s(?:width|height)="/);
  });
});

test("SVG processing rejects external references before optimization or rasterization", async () => {
  await withSvgTempDir(async (directory) => {
    const input = path.join(directory, "external.svg");
    await fs.writeFile(
      input,
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.test/a.png" /></svg>`
    );

    const result = await processSvgFiles(
      { inputPaths: [input], outputDir: path.join(directory, "output"), outputFormat: "png" },
      createHistory()
    );

    assert.equal(result.status, "error");
    assert.match(result.items[0].errorMessage, /External SVG references are not allowed/);
    assert.deepEqual(result.files, []);
  });
});

test("SVG processing rejects XML entities, event handlers, active content, and imported styles", async () => {
  await withSvgTempDir(async (directory) => {
    const unsafeSources = [
      `<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" />`,
      `<svg xmlns="http://www.w3.org/2000/svg"><!ENTITY payload "unsafe"></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" />`,
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>unsafe</div></foreignObject></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://example.test/theme.css");</style></svg>`
    ];
    const inputPaths = [];
    for (const [index, source] of unsafeSources.entries()) {
      const input = path.join(directory, `unsafe-${index}.svg`);
      await fs.writeFile(input, source);
      inputPaths.push(input);
    }

    const result = await processSvgFiles(
      { inputPaths, outputDir: path.join(directory, "output"), outputFormat: "svg" },
      createHistory()
    );
    assert.equal(result.status, "error");
    assert.ok(result.items.every((item) => item.status === "error"));
    assert.equal(result.items.length, unsafeSources.length);
    assert.deepEqual(result.files, []);
  });
});

test("SVG raster output respects requested dimensions and rejects oversized canvases", async () => {
  await withSvgTempDir(async (directory) => {
    const input = path.join(directory, "ratio.svg");
    await fs.writeFile(input, validSvg);

    const pngResult = await processSvgFiles(
      {
        inputPaths: [input],
        outputDir: path.join(directory, "png"),
        outputFormat: "png",
        width: 400
      },
      createHistory()
    );
    assert.equal(pngResult.status, "success");
    const metadata = await sharp(await fs.readFile(pngResult.files[0])).metadata();
    assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 400, height: 200 });

    const webpResult = await processSvgFiles(
      {
        inputPaths: [input],
        outputDir: path.join(directory, "webp"),
        outputFormat: "webp",
        width: 320,
        height: 320,
        quality: 82
      },
      createHistory()
    );
    assert.equal(webpResult.status, "success");
    const webpMetadata = await sharp(await fs.readFile(webpResult.files[0])).metadata();
    assert.deepEqual(
      { format: webpMetadata.format, width: webpMetadata.width, height: webpMetadata.height },
      { format: "webp", width: 320, height: 320 }
    );

    const oversized = await processSvgFiles(
      {
        inputPaths: [input],
        outputDir: path.join(directory, "oversized"),
        outputFormat: "webp",
        width: 8192,
        height: 8192
      },
      createHistory()
    );
    assert.equal(oversized.status, "error");
    assert.match(oversized.items[0].errorMessage, /total pixels/);
    assert.deepEqual(oversized.files, []);
  });
});

test("SVG processing rejects inputs above the bounded optimization size", async () => {
  await withSvgTempDir(async (directory) => {
    const input = path.join(directory, "large.svg");
    await fs.writeFile(input, `<svg xmlns="http://www.w3.org/2000/svg">${" ".repeat(5 * 1024 * 1024)}</svg>`);

    const result = await processSvgFiles(
      { inputPaths: [input], outputDir: path.join(directory, "output"), outputFormat: "svg" },
      createHistory()
    );
    assert.equal(result.status, "error");
    assert.match(result.items[0].errorMessage, /5 MiB input safety limit/);
  });
});

test("PWA icon packages contain the documented mobile assets, manifest, HTML, and ZIP", async () => {
  await withSvgTempDir(async (directory) => {
    const input = path.join(directory, "中文 应用.png");
    const outputDir = path.join(directory, "output");
    await sharp({
      create: { width: 640, height: 480, channels: 4, background: "#14b8a6" }
    }).png().toFile(input);

    const history = createHistory();
    const result = await generatePwaIconPackages(
      {
        inputPaths: [input],
        outputDir,
        appName: "开发者工具箱",
        shortName: "工具箱",
        themeColor: "#0d9488",
        backgroundColor: "#ffffff",
        maskablePadding: 0.2
      },
      history
    );

    assert.equal(result.status, "success");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].status, "success");
    assert.equal(history.starts[0].toolType, "pwa-icons");
    assert.equal(history.finishes.at(-1)[1], "success");

    const zipPath = result.items[0].outputPath;
    const packageDir = path.join(outputDir, path.basename(zipPath, ".zip"));
    const expectedSizes = new Map([
      ["pwa-192x192.png", [192, 192]],
      ["pwa-512x512.png", [512, 512]],
      ["maskable-192x192.png", [192, 192]],
      ["maskable-512x512.png", [512, 512]],
      ["apple-touch-icon.png", [180, 180]],
      ["favicon-32x32.png", [32, 32]]
    ]);
    for (const [fileName, [width, height]] of expectedSizes) {
      const metadata = await sharp(path.join(packageDir, fileName)).metadata();
      assert.deepEqual({ format: metadata.format, width: metadata.width, height: metadata.height }, { format: "png", width, height });
    }

    const manifest = JSON.parse(await fs.readFile(path.join(packageDir, "site.webmanifest"), "utf8"));
    assert.equal(manifest.name, "开发者工具箱");
    assert.equal(manifest.icons.filter((icon) => icon.purpose === "any").length, 2);
    assert.equal(manifest.icons.filter((icon) => icon.purpose === "maskable").length, 2);
    assert.ok(manifest.icons.every((icon) => icon.src.startsWith("./")));
    const html = await fs.readFile(path.join(packageDir, "head-snippet.html"), "utf8");
    assert.match(html, /site\.webmanifest/);
    assert.match(html, /apple-touch-icon\.png/);

    const archive = await JSZip.loadAsync(await fs.readFile(zipPath));
    const archiveFiles = Object.keys(archive.files).filter((name) => !archive.files[name].dir);
    assert.equal(archiveFiles.length, 8);
    assert.ok(archiveFiles.every((name) => name.startsWith(`${path.basename(packageDir)}/`)));
  });
});

test("PWA batch rejects unsafe SVGs, continues valid items, and never overwrites an existing package", async () => {
  await withSvgTempDir(async (directory) => {
    const valid = path.join(directory, "应用.png");
    const unsafe = path.join(directory, "unsafe.svg");
    const outputDir = path.join(directory, "output");
    const existingDir = path.join(outputDir, "应用-pwa-icons");
    const existingZip = path.join(outputDir, "应用-pwa-icons.zip");
    await sharp({ create: { width: 256, height: 256, channels: 4, background: "#2563eb" } }).png().toFile(valid);
    await fs.writeFile(unsafe, `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/track.png" /></svg>`);
    await fs.mkdir(existingDir, { recursive: true });
    await fs.writeFile(path.join(existingDir, "sentinel.txt"), "keep-directory");
    await fs.writeFile(existingZip, "keep-archive");

    const result = await generatePwaIconPackages(
      {
        inputPaths: [unsafe, valid],
        outputDir,
        appName: "App",
        shortName: "App",
        themeColor: "#111827",
        backgroundColor: "#ffffff",
        maskablePadding: 0.2
      },
      createHistory()
    );

    assert.equal(result.status, "partial");
    assert.deepEqual(result.items.map((item) => item.status), ["error", "success"]);
    assert.match(result.items[0].errorMessage, /External SVG references are not allowed/);
    assert.equal(path.basename(result.items[1].outputPath), "应用-pwa-icons-2.zip");
    assert.equal(await fs.readFile(path.join(existingDir, "sentinel.txt"), "utf8"), "keep-directory");
    assert.equal(await fs.readFile(existingZip, "utf8"), "keep-archive");
    assert.deepEqual((await fs.readdir(outputDir)).filter((name) => name.includes(".part-")), []);
  });
});
