const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { normalizeManifestUrl: normalizeBuildManifestUrl, prepareBuildConfig } = require("../scripts/prepare-build-config.cjs");

const { sanitizeStickyNoteHtml } = require("../dist/electron/main/services/sticky-notes.service.js");
const {
  claimInstallerLaunch,
  createPendingUpdateSnapshot,
  isValidUpdateSha256,
  normalizeUpdateManifestUrl,
  readManifestStream,
  restoreInstallerLaunch,
  resolveUpdateDownloadUrl,
  selectUpdateDownload
} = require("../dist/electron/main/services/autoUpdater.service.js");

test("release build config embeds an HTTP update feed without credentials", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-toolbox-update-config-"));
  const previousAutoUpdateUrl = process.env.AUTOUPDATE_FEED_URL;
  const previousDesktopUrl = process.env.DESKTOP_APP_UPDATE_URL;
  try {
    process.env.AUTOUPDATE_FEED_URL = "";
    process.env.DESKTOP_APP_UPDATE_URL = "http://127.0.0.1/download/release-manifest.json";
    const result = prepareBuildConfig(root);
    const config = JSON.parse(fs.readFileSync(result.outputPath, "utf8"));
    assert.equal(config.manifestUrl, "http://127.0.0.1/download/release-manifest.json");
    assert.equal(result.configured, true);
  } finally {
    if (previousAutoUpdateUrl === undefined) delete process.env.AUTOUPDATE_FEED_URL;
    else process.env.AUTOUPDATE_FEED_URL = previousAutoUpdateUrl;
    if (previousDesktopUrl === undefined) delete process.env.DESKTOP_APP_UPDATE_URL;
    else process.env.DESKTOP_APP_UPDATE_URL = previousDesktopUrl;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("updater accepts personal HTTP feeds but rejects credentials and non-web protocols", () => {
  assert.equal(
    normalizeUpdateManifestUrl("http://127.0.0.1/download/release-manifest.json"),
    "http://127.0.0.1/download/release-manifest.json"
  );
  assert.throws(() => normalizeUpdateManifestUrl("http://user:password@127.0.0.1/release.json"), /without embedded credentials/i);
  assert.throws(() => normalizeUpdateManifestUrl("file:///tmp/release.json"), /must use HTTP/i);
  assert.throws(() => normalizeUpdateManifestUrl("http://dev-toolbox.invalid/release.json"), /placeholder hostname/i);
  assert.throws(() => normalizeUpdateManifestUrl("http://xxx.com/release.json"), /placeholder hostname/i);
  assert.throws(() => normalizeBuildManifestUrl("http://dev-toolbox.invalid/release.json"), /placeholder hostname/i);
});

test("sticky note sanitizer removes executable markup and preserves safe formatting", () => {
  const sanitized = sanitizeStickyNoteHtml(`
    <script>alert(1)</script>
    <img src="x" onerror="alert(2)">
    <a href="jav&#x61;script:alert(3)" onclick="alert(4)">unsafe</a>
    <a href="https://example.com/docs?a=1&amp;b=2">safe link</a>
    <span data-note-styled="true" style="color: red; background-image: url(javascript:alert(5))">formatted</span>
  `);

  assert.doesNotMatch(sanitized, /<script|onerror|onclick|javascript:|background-image/i);
  assert.match(sanitized, /href="https:\/\/example\.com\/docs\?a=1&amp;b=2"/);
  assert.match(sanitized, /style="color: red"/);
  assert.match(sanitized, /data-note-styled="true"/);
});

test("updater resolves relative HTTP URLs against the manifest location", () => {
  assert.equal(
    resolveUpdateDownloadUrl("http://127.0.0.1/download/release-manifest.json", "./release/Dev%20Toolbox.exe"),
    "http://127.0.0.1/download/release/Dev%20Toolbox.exe"
  );
});

test("updater chooses the matching platform and architecture", () => {
  const selected = selectUpdateDownload([
    { url: "./mac.dmg", platform: "darwin", arch: "arm64", primary: true },
    { url: "./win-arm64.exe", platform: "windows", arch: "arm64" },
    { url: "./win-x64.exe", platform: "win32", arch: "amd64" }
  ], "win32", "x64");
  assert.equal(selected.url, "./win-x64.exe");
  assert.throws(
    () => selectUpdateDownload([{ url: "./mac.dmg", platform: "darwin", arch: "arm64" }], "win32", "x64"),
    /没有适用于/
  );
});

test("updater accepts only a 64-character hexadecimal SHA-256", () => {
  assert.equal(isValidUpdateSha256("A".repeat(64)), true);
  assert.equal(isValidUpdateSha256("a".repeat(63)), false);
  assert.equal(isValidUpdateSha256(`${"a".repeat(63)}z`), false);
});

test("updater reads a manifest without Content-Length through a bounded Web stream", async () => {
  const source = JSON.stringify({ latestVersion: "1.2.3", label: "中文更新" });
  const bytes = new TextEncoder().encode(source);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 17));
      controller.enqueue(bytes.subarray(17));
      controller.close();
    }
  });

  assert.equal(await readManifestStream(stream), source);
});

test("updater cancels a manifest stream as soon as it exceeds the byte limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    }
  });

  await assert.rejects(readManifestStream(stream), /更新清单超过 1 MiB 限制/);
  assert.equal(cancelled, true);
});

test("updater download snapshots are immutable and detached from later checks", () => {
  const pending = {
    version: "1.2.3",
    downloadUrl: "http://127.0.0.1/releases/1.2.3.exe",
    size: 42,
    sha256: "a".repeat(64)
  };
  const snapshot = createPendingUpdateSnapshot(pending);

  pending.version = "9.9.9";
  pending.downloadUrl = "http://127.0.0.1/releases/9.9.9.exe";

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.version, "1.2.3");
  assert.equal(snapshot.downloadUrl, "http://127.0.0.1/releases/1.2.3.exe");
});

test("installer launch claim is exclusive and restores the verified path after failure", () => {
  const state = {
    preparedInstallerPath: "C:\\Temp\\Dev Toolbox.exe",
    installInProgress: false
  };

  const claimedPath = claimInstallerLaunch(state);
  assert.equal(claimedPath, "C:\\Temp\\Dev Toolbox.exe");
  assert.equal(state.installInProgress, true);
  assert.equal(state.preparedInstallerPath, null);
  assert.equal(claimInstallerLaunch(state), null, "a concurrent install must not claim the same package");

  restoreInstallerLaunch(state, claimedPath);
  assert.equal(state.installInProgress, false);
  assert.equal(state.preparedInstallerPath, claimedPath);
  assert.equal(claimInstallerLaunch(state), claimedPath, "a failed launch must remain retryable");
});
