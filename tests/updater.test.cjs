const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { UpdateController, supportsUpdates } = require("../dist/electron/main/services/update-controller.js");
const { UpdateTaskGate, isUpdateBlockingTask } = require("../dist/electron/main/services/update-task-gate.js");
const { verifyTag, verifyRelease } = require("../scripts/verify-release.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

class Client extends EventEmitter {
  checks = 0; downloads = 0; installs = 0;
  checkForUpdates() { this.checks++; return this.checkResult || Promise.resolve(); }
  downloadUpdate() { this.downloads++; return this.downloadResult || Promise.resolve(); }
  quitAndInstall(...args) {
    this.installs++;
    this.installArgs = args;
    if (this.installError) throw new Error("installer failure");
  }
}

function fixture(prepare = async () => true, enabled = true) {
  const client = new Client();
  const gate = new UpdateTaskGate();
  const states = [];
  let quitting = false;
  const controller = new UpdateController(client, enabled, gate, (s) => states.push(s), prepare, (v) => { quitting = v; });
  return { client, gate, controller, states, get quitting() { return quitting; } };
}

async function download(f) {
  await f.controller.check();
  f.client.emit("update-available", { version: "0.1.7" });
  await f.controller.download();
  f.client.emit("update-downloaded", { version: "0.1.7" });
}

test("manual stable updates, exclusive checks/downloads, retained installer and independent snapshots", async () => {
  const f = fixture();
  for (const field of ["autoDownload", "autoInstallOnAppQuit", "allowPrerelease", "allowDowngrade"]) assert.equal(f.client[field], false);
  const check = deferred();
  f.client.checkResult = check.promise;
  const pendingCheck = f.controller.check();
  await f.controller.check();
  assert.equal(f.client.checks, 1);
  f.client.emit("update-available", { version: "0.1.7" });
  await f.controller.check(); await f.controller.download();
  assert.equal(f.client.checks, 1); assert.equal(f.client.downloads, 0);
  check.resolve(); await pendingCheck;
  assert.equal(f.client.downloads, 0);
  const downloading = deferred();
  f.client.downloadResult = downloading.promise;
  const pendingDownload = f.controller.download();
  await f.controller.download(); await f.controller.check();
  assert.equal(f.client.downloads, 1); assert.equal(f.client.checks, 1);
  f.client.emit("download-progress", { percent: 37.5 });
  assert.equal(f.controller.getState().percent, 38);
  f.client.emit("download-progress", { percent: NaN });
  assert.equal(f.controller.getState().percent, 0);
  f.client.emit("update-downloaded", { version: "0.1.7" });
  downloading.resolve(); await pendingDownload;
  await f.controller.check();
  assert.equal(f.client.checks, 1);
  const snapshot = f.controller.getState(); snapshot.status = "error";
  assert.equal(f.controller.getState().status, "downloaded");
  await f.controller.install(); await f.controller.install();
  assert.equal(f.client.installs, 1);
  assert.deepEqual(f.client.installArgs, [false, true]);
  assert.equal(f.quitting, true);
});

test("installation locks before asynchronous save; failed save retains package and unlocks work", async () => {
  const save = deferred();
  const f = fixture(() => save.promise);
  await download(f);
  const installation = f.controller.install();
  await f.controller.install();
  await assert.rejects(f.gate.run(() => 1), /正在准备安装/);
  assert.equal(f.client.installs, 0);
  save.resolve(false);
  await assert.rejects(installation, /保存失败/);
  assert.equal(f.controller.getState().status, "downloaded");
  assert.equal(f.quitting, false);
  assert.equal(await f.gate.run(() => 42), 42);
});

test("all active jobs block installation and installer failure requires a fresh app session", async () => {
  const f = fixture(); await download(f);
  const work = deferred();
  const operation = f.gate.run(() => work.promise);
  assert.equal(f.controller.getState().activeTasks, 1);
  await assert.rejects(f.controller.install(), /文件任务正在处理/);
  work.resolve(); await operation;
  await assert.rejects(f.gate.run(() => { throw new Error("conversion failed"); }), /conversion failed/);
  assert.equal(f.gate.activeTasks, 0);
  f.client.installError = true;
  await f.controller.install();
  assert.equal(f.quitting, false);
  assert.equal(f.controller.getState().status, "disabled");
  assert.match(f.controller.getState().message, /重新启动/);
  assert.equal(await f.gate.run(() => 7), 7);
  await assert.rejects(f.controller.install(), /请先下载/);
  const fresh = fixture(); await download(fresh);
  await fresh.controller.install();
  fresh.client.emit("error", new Error("async installer failed"));
  assert.equal(fresh.quitting, false);
  assert.equal(fresh.controller.getState().status, "disabled");
});

test("network failures can be retried without exposing provider URLs", async () => {
  const f = fixture();
  f.client.checkResult = Promise.reject(new Error("https://private.invalid/?token=secret"));
  await f.controller.check();
  assert.equal(f.controller.getState().status, "error");
  assert.doesNotMatch(f.controller.getState().message, /https|secret/);
  f.client.checkResult = Promise.resolve();
  await f.controller.check();
  f.client.emit("update-not-available");
  assert.equal(f.controller.getState().status, "not-available");
  await f.controller.check();
  f.client.emit("update-available", { version: "0.1.7" });
  f.client.downloadResult = Promise.reject(new Error("network failed"));
  await f.controller.download();
  assert.equal(f.controller.getState().status, "error");
  await f.controller.check();
  assert.equal(f.controller.getState().status, "checking");
});

test("only packaged Windows x64 enables updates; stopped timers and dev mode do no work", async () => {
  assert.equal(supportsUpdates(true, "win32", "x64"), true);
  for (const args of [[false, "win32", "x64"], [true, "darwin", "x64"], [true, "win32", "arm64"]]) assert.equal(supportsUpdates(...args), false);
  const f = fixture(undefined, false);
  f.controller.start(); f.controller.stop();
  await f.controller.check(); await f.controller.download();
  await assert.rejects(f.controller.install(), /请先下载/);
  assert.equal(f.client.checks, 0); assert.equal(f.client.downloads, 0);
});

test("file-producing IPC calls participate in the install gate, draft saves remain available", () => {
  for (const channel of ["convert:video-compress", "convert:svg-toolbox", "files:rename", "file:write-text", "notes:import", "notes:export", "assets:manifest", "seo:files"]) assert.equal(isUpdateBlockingTask(channel), true);
  for (const channel of ["notes:save", "config:save", "settings:load", "update:install", "update:state"]) assert.equal(isUpdateBlockingTask(channel), false);
});

test("release gate rejects wrong versions, corrupted packages, missing files and incorrect feed", async () => {
  const yaml = require("js-yaml"); const asar = require("@electron/asar");
  verifyTag("0.1.6", "v0.1.6");
  for (const [version, tag] of [["0.1.6", "v0.1.5"], ["0.1.6-beta.1", "v0.1.6-beta.1"]]) assert.throws(() => verifyTag(version, tag));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-release-"));
  try {
    const resources = path.join(root, "win-unpacked/resources");
    const source = path.join(root, "fixture");
    for (const file of ["dist/electron/main/index.js", "dist/electron/preload/index.js", "dist/renderer/index.html", "node_modules/electron-updater/package.json"]) {
      await fs.mkdir(path.dirname(path.join(source, file)), { recursive: true });
      await fs.writeFile(path.join(source, file), "{}");
    }
    await fs.writeFile(path.join(source, "package.json"), JSON.stringify({ version: "0.1.6" }));
    await fs.mkdir(resources, { recursive: true });
    await asar.createPackage(source, path.join(resources, "app.asar"));
    const feed = { provider: "github", owner: "CoffeeHouse1122", repo: "Dev-Toolbox", private: false };
    const feedPath = path.join(resources, "app-update.yml");
    await fs.writeFile(feedPath, yaml.dump(feed));
    const filename = "Dev-Toolbox-0.1.6-x64.exe";
    const bytes = Buffer.from("synthetic installer");
    await fs.writeFile(path.join(root, filename), bytes);
    await fs.writeFile(path.join(root, `${filename}.blockmap`), "blockmap");
    await fs.writeFile(path.join(root, "latest.yml"), yaml.dump({ version: "0.1.6", files: [{ url: filename, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") }] }));
    await verifyRelease(root, "0.1.6", false);
    await fs.writeFile(feedPath, yaml.dump({ ...feed, repo: "DeskScribe" }));
    await assert.rejects(verifyRelease(root, "0.1.6", false));
    await fs.writeFile(feedPath, yaml.dump({ ...feed, token: "must-not-ship" }));
    await assert.rejects(verifyRelease(root, "0.1.6", false), /token/);
    await fs.writeFile(feedPath, yaml.dump(feed));
    await fs.writeFile(path.join(root, filename), Buffer.alloc(bytes.length, 1));
    await assert.rejects(verifyRelease(root, "0.1.6", false), /hash/);
    await fs.writeFile(path.join(root, filename), bytes);
    await fs.unlink(path.join(root, `${filename}.blockmap`));
    await assert.rejects(verifyRelease(root, "0.1.6", false), /ENOENT/);
    await fs.writeFile(path.join(root, `${filename}.blockmap`), "blockmap");
    await fs.mkdir(path.join(source, "dist/main"), { recursive: true });
    await fs.writeFile(path.join(source, "dist/main/legacy.js"), "legacy fixture");
    await asar.createPackage(source, path.join(resources, "app.asar"));
    await assert.rejects(verifyRelease(root, "0.1.6", false), /Legacy compiled/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("release workflow parses and keeps local packaging separate from draft-first publication", async () => {
  const yaml = require("js-yaml");
  const pkg = require("../package.json");
  const workflow = yaml.load(await fs.readFile(path.join(__dirname, "../.github/workflows/release.yml"), "utf8"));
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  const steps = workflow.jobs.windows.steps;
  const upload = steps.findIndex((step) => step.uses?.startsWith("softprops/action-gh-release"));
  assert.equal(steps[upload].with.draft, true);
  assert.equal(steps[upload].with.fail_on_unmatched_files, true);
  assert.match(steps[upload + 1].run, /--draft=false --latest/);
  for (const command of ["pack", "dist", "dist:win", "dist:win:dir"]) assert.match(pkg.scripts[command], /--publish never/);
  assert.deepEqual(pkg.build.publish, { provider: "github", owner: "CoffeeHouse1122", repo: "Dev-Toolbox", private: false });
  assert.equal(pkg.build.win.verifyUpdateCodeSignature, false);
  assert.ok(!pkg.build.files.includes("dist/**/*"), "Do not package stale compiled directories");
  for (const directory of ["electron", "shared", "renderer"]) assert.ok(pkg.build.files.includes(`dist/${directory}/**/*`));
});

test("trusted IPC holds the actual task gate until a handler settles, while save IPC remains usable", async () => {
  const Module = require("node:module");
  const { pathToFileURL } = require("node:url");
  const { updateTaskGate } = require("../dist/electron/main/services/update-task-gate.js");
  const handlers = new Map();
  const originalLoad = Module._load;
  let handleTrustedIpc;
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "electron") return { ipcMain: { handle: (name, listener) => handlers.set(name, listener) } };
      return originalLoad.call(this, request, parent, isMain);
    };
    ({ handleTrustedIpc } = require("../dist/electron/main/utils/ipc-security.js"));
  } finally { Module._load = originalLoad; }
  const previousDevUrl = process.env.VITE_DEV_SERVER_URL;
  delete process.env.VITE_DEV_SERVER_URL;
  const event = { senderFrame: { url: pathToFileURL(path.resolve(__dirname, "../dist/renderer/index.html")).href } };
  const work = deferred();
  try {
    handleTrustedIpc("convert:test", () => work.promise);
    handleTrustedIpc("notes:save", () => "saved");
    assert.throws(() => handlers.get("convert:test")({ senderFrame: { url: "https://untrusted.invalid" } }), /not a trusted renderer/);
    assert.equal(updateTaskGate.activeTasks, 0);
    const operation = handlers.get("convert:test")(event);
    assert.equal(updateTaskGate.activeTasks, 1);
    assert.throws(() => updateTaskGate.beginInstall(), /文件任务/);
    work.resolve(); await operation;
    updateTaskGate.beginInstall();
    await assert.rejects(handlers.get("convert:test")(event), /正在准备安装/);
    assert.equal(handlers.get("notes:save")(event), "saved");
  } finally {
    updateTaskGate.endInstall();
    if (previousDevUrl !== undefined) process.env.VITE_DEV_SERVER_URL = previousDevUrl;
  }
});
