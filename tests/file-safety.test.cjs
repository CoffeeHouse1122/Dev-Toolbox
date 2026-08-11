const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

// Main-process services import Electron, but these unit tests exercise only
// pure file functions. Keep the suite independent from a downloaded runtime.
const originalLoad = Module._load;
Module._load = function loadForFileSafetyTests(request, parent, isMain) {
  if (request === "electron") {
    return {
      BrowserWindow: class BrowserWindow {},
      app: { isPackaged: false, getAppPath: () => path.resolve(__dirname, "..") }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { safeBaseName, sanitizeFileName, writeTextFile } = require("../dist/electron/main/services/file-utils.js");
const { base64ToImage, planRenameFiles, renameFiles } = require("../dist/electron/main/services/utility.service.js");
const { compressImages, convertImages } = require("../dist/electron/main/services/image.service.js");
const { generateAssetManifest } = require("../dist/electron/main/services/asset-manifest.service.js");
Module._load = originalLoad;

const history = {
  async startTask() {},
  async finishTask() {}
};

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-file-safety-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

test("file names preserve Unicode and neutralize Windows-reserved components", () => {
  assert.equal(safeBaseName("中文 文件😀.png"), "中文 文件😀");
  assert.equal(safeBaseName("CON.txt"), "_CON");
  assert.equal(sanitizeFileName("报告<>:?.png"), "报告----.png");
  assert.equal(sanitizeFileName("trailing. "), "trailing");
  assert.ok(safeBaseName(`${"长".repeat(300)}.png`).length <= 180);
});

test("rename planning rejects a whole-batch collision before changing any source", async () => {
  await withTempDir(async (dir) => {
    const first = path.join(dir, "中文.txt");
    const second = path.join(dir, "你好.txt");
    await fs.writeFile(first, "first");
    await fs.writeFile(second, "second");

    await assert.rejects(
      planRenameFiles({ inputPaths: [first, second], pattern: "固定", start: 1 }),
      /Multiple files would be renamed/
    );
    assert.equal(await fs.readFile(first, "utf8"), "first");
    assert.equal(await fs.readFile(second, "utf8"), "second");
  });
});

test("rename planning detects existing case-insensitive targets", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "source.txt");
    const existing = path.join(dir, "TARGET.txt");
    await fs.writeFile(source, "source");
    await fs.writeFile(existing, "existing");
    await assert.rejects(planRenameFiles({ inputPaths: [source], pattern: "target", start: 1 }), /Target already exists/);
    assert.equal(await fs.readFile(existing, "utf8"), "existing");
  });
});

test("rename dry-run and execution use the same Unicode-safe plan", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "测试 文件😀.txt");
    await fs.writeFile(source, "content");
    const options = { inputPaths: [source], pattern: "{name}-{n}", start: 7 };
    const plan = await planRenameFiles(options);
    const dryRun = await renameFiles({ ...options, dryRun: true }, history);
    assert.equal(dryRun.items[0].outputPath, plan[0].target);
    assert.equal(await fs.readFile(source, "utf8"), "content");

    const result = await renameFiles(options, history);
    assert.equal(result.status, "success");
    assert.equal(path.basename(result.files[0]), "测试 文件😀-007.txt");
    assert.equal(await fs.readFile(result.files[0], "utf8"), "content");
    await assert.rejects(fs.access(source));
  });
});

test("two-phase rename safely handles a target that is another source", async () => {
  await withTempDir(async (dir) => {
    const first = path.join(dir, "001.txt");
    const second = path.join(dir, "002.txt");
    await fs.writeFile(first, "from-001");
    await fs.writeFile(second, "from-002");
    const result = await renameFiles({ inputPaths: [first, second], pattern: "{n}", start: 2 }, history);
    assert.equal(result.status, "success");
    assert.equal(await fs.readFile(path.join(dir, "002.txt"), "utf8"), "from-001");
    assert.equal(await fs.readFile(path.join(dir, "003.txt"), "utf8"), "from-002");
  });
});

test("Base64 image output cannot escape the chosen directory", async () => {
  await withTempDir(async (dir) => {
    const outputDir = path.join(dir, "safe");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await assert.rejects(base64ToImage(`data:image/png;base64,${png}`, outputDir, "..\\escaped.png"), /must not contain a directory/);
    await assert.rejects(fs.access(path.join(dir, "escaped.png")));
  });
});

test("Base64 image validates MIME and decoded file signature", async () => {
  await withTempDir(async (dir) => {
    const notAnImage = Buffer.from("not-an-image").toString("base64");
    await assert.rejects(base64ToImage(`data:image/png;base64,${notAnImage}`, dir, "bad.png"), /not a supported image/);
    await assert.rejects(base64ToImage(`data:text/plain;base64,${notAnImage}`, dir, "bad.png"), /Unsupported image MIME/);
  });
});

test("text output replacement is complete and leaves no part file", async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, "manifest.json");
    await writeTextFile(output, "old");
    await writeTextFile(output, "new-value");
    assert.equal(await fs.readFile(output, "utf8"), "new-value");
    assert.deepEqual((await fs.readdir(dir)).filter((name) => name.includes(".part-")), []);
  });
});

test("asset manifest excludes itself, uses relative sorted paths, and streams hashes", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "b.txt"), "b");
    await fs.writeFile(path.join(dir, "a.txt"), "a");
    await fs.writeFile(path.join(dir, "asset-manifest.json"), "old manifest");
    const result = await generateAssetManifest(
      { sourceDir: dir, outputDir: dir, baseName: "asset-manifest", includeHash: true },
      history
    );
    assert.equal(result.status, "success");
    const manifest = JSON.parse(await fs.readFile(result.files[0], "utf8"));
    assert.equal(manifest.sourceDir, ".");
    assert.deepEqual(manifest.assets.map((item) => item.path), ["a.txt", "b.txt"]);
    assert.ok(manifest.assets.every((item) => /^[a-f0-9]{64}$/.test(item.hash)));
  });
});

test("same-directory same-format image conversion never overwrites its source", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "原图.png");
    await sharp({ create: { width: 2, height: 2, channels: 4, background: "#ff0000" } }).png().toFile(source);
    const before = hash(await fs.readFile(source));
    const result = await convertImages(
      {
        inputPaths: [source],
        outputDir: dir,
        outputFormat: "png",
        quality: 90,
        lossless: false,
        keepMetadata: false
      },
      history
    );
    assert.equal(result.status, "success");
    assert.notEqual(result.files[0], source);
    assert.equal(hash(await fs.readFile(source)), before);
  });
});

test("image batch continues after an item failure and reports partial", async () => {
  await withTempDir(async (dir) => {
    const invalid = path.join(dir, "broken.png");
    const valid = path.join(dir, "valid.png");
    const outputDir = path.join(dir, "output");
    await fs.writeFile(invalid, "not an image");
    await sharp({ create: { width: 2, height: 2, channels: 4, background: "#00ff00" } }).png().toFile(valid);
    const result = await convertImages(
      {
        inputPaths: [invalid, valid],
        outputDir,
        outputFormat: "webp",
        quality: 80,
        lossless: false,
        keepMetadata: false
      },
      history
    );
    assert.equal(result.status, "partial");
    assert.deepEqual(result.items.map((item) => item.status), ["error", "success"]);
    assert.equal(result.files.length, 1);
    await fs.access(result.files[0]);
  });
});

test("AVIF compression keeps AVIF content and extension", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "输入.avif");
    const outputDir = path.join(dir, "output");
    await sharp({ create: { width: 2, height: 2, channels: 4, background: "#0000ff" } }).avif().toFile(source);
    const result = await compressImages(
      { inputPaths: [source], outputDir, quality: 75, keepMetadata: false, keepOriginalName: true },
      history
    );
    assert.equal(result.status, "success");
    assert.equal(path.extname(result.files[0]), ".avif");
    assert.equal((await sharp(result.files[0]).metadata()).format, "heif");
  });
});
