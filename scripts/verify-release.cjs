const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");

function verifyTag(version, tag) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Only stable versions are supported");
  assert.equal(tag, `v${version}`, "Release tag must match package.json version");
}

async function verifyRelease(directory, version, signed = Boolean(process.env.CSC_LINK), projectRoot) {
  const yaml = require("js-yaml");
  const asar = require("@electron/asar");
  const metadata = yaml.load(await fs.readFile(path.join(directory, "latest.yml"), "utf8"));
  assert.equal(metadata.version, version);
  const filename = `Dev-Toolbox-${version}-x64.exe`;
  assert.equal(metadata.files.length, 1, "Expected exactly one Windows x64 installer");
  const info = metadata.files[0];
  assert.equal(decodeURIComponent(info.url), filename);
  const installerPath = path.join(directory, filename);
  assert.equal(info.size, (await fs.stat(installerPath)).size);
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(installerPath)) hash.update(chunk);
  assert.equal(info.sha512, hash.digest("base64"), "Installer hash must match latest.yml");
  assert.ok((await fs.stat(`${installerPath}.blockmap`)).size > 0, "Missing blockmap");
  const resources = path.join(directory, "win-unpacked", "resources");
  const config = yaml.load(await fs.readFile(path.join(resources, "app-update.yml"), "utf8"));
  assert.equal(config.provider, "github");
  assert.equal(config.owner, "CoffeeHouse1122");
  assert.equal(config.repo, "Dev-Toolbox");
  assert.notEqual(config.private, true);
  assert.equal(config.token, undefined, "Never embed a GitHub token in the app");
  if (signed) assert.ok(config.publisherName?.length, "Signed updates must verify publisher identity");
  else assert.equal(config.publisherName, undefined, "Unsigned updates must not require a signing certificate");

  const archive = path.join(resources, "app.asar");
  asar.uncache(archive);
  const entries = asar.listPackage(archive).map((entry) => entry.replace(/\\/g, "/"));
  assert.equal(JSON.parse(asar.extractFile(archive, "package.json").toString("utf8")).version, version);
  for (const entry of ["/dist/electron/main/index.js", "/dist/electron/preload/index.js", "/dist/renderer/index.html", "/node_modules/electron-updater/package.json"]) {
    assert.ok(entries.includes(entry), `Missing application entry: ${entry}`);
  }
  assert.ok(!entries.includes("/dist/electron/update-config.json"), "Legacy feed must not be packaged");
  assert.ok(!entries.includes("/.env"), "Local environment must not be packaged");
  assert.ok(!entries.some((entry) => /^\/dist\/(?:main|preload)\//.test(entry)), "Legacy compiled directories must not be packaged");
  if (projectRoot) {
    for (const relativePath of ["dist/electron/main/index.js", "dist/electron/main/services/update-controller.js", "dist/electron/main/services/update-task-gate.js", "dist/electron/main/services/autoUpdater.service.js", "dist/electron/main/utils/ipc-security.js", "dist/electron/preload/index.js"]) {
      assert.deepEqual(asar.extractFile(archive, path.normalize(relativePath)), await fs.readFile(path.join(projectRoot, relativePath)), `Stale packaged code: ${relativePath}`);
    }
  }
  return [filename, `${filename}.blockmap`, "latest.yml"];
}

async function assertReleaseWritable(tag) {
  const response = await fetch(`https://api.github.com/repos/CoffeeHouse1122/Dev-Toolbox/releases/tags/${encodeURIComponent(tag)}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (response.status === 404) return;
  assert.ok(response.ok, `Cannot inspect release (${response.status})`);
  assert.equal((await response.json()).draft, true, "Published releases cannot be overwritten; use a new version");
}

if (require.main === module) {
  (async () => {
    const root = path.resolve(__dirname, "..");
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages[""].version, pkg.version);
    if (process.argv.includes("--tag")) {
      verifyTag(pkg.version, process.env.RELEASE_TAG);
    } else if (process.argv.includes("--remote")) {
      verifyTag(pkg.version, process.env.RELEASE_TAG);
      await assertReleaseWritable(process.env.RELEASE_TAG);
    } else {
      await verifyRelease(path.join(root, "release"), pkg.version, Boolean(process.env.CSC_LINK), root);
    }
    console.log("Release verification passed.");
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { verifyTag, verifyRelease };
