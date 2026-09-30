const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const output = path.resolve(__dirname, "../out/toast-ui-smoke");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-prefers-reduced-motion");
let saved = { "/qr-code": { selectedPath: "C:\\missing-qr" }, "/image-compress": { selectedPath: "C:\\missing-images" } };
let openStatus = "blocked";
let pickedDir = "C:\\test-output";
let pickFails = false;
let qrRejects = false;
let pendingPath;
for (const [channel, handler] of Object.entries({
  "config:load": (_e, key) => key === "output-picker" ? saved : null,
  "config:save": (_e, key, value) => { if (key === "output-picker") saved = value; return value; },
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.8",
  "update:state": () => ({ status: "disabled", activeTasks: 0 }),
  "file:path-exists": async (_e, value) => { if (pendingPath) await pendingPath; return !value.includes("missing"); },
  "dialog:select-output-dir": () => { if (pickFails) throw new Error("测试：无法选择目录"); return pickedDir; },
  "shell:open-directory": () => ({ status: openStatus, message: openStatus === "blocked" ? "测试：已有目录正在打开" : "" }),
  "dialog:select-files": () => ["C:\\test-input.mp4"],
  "media:info": () => { throw new Error("测试：无法读取媒体信息"); },
  "qr:generate": () => {
    if (qrRejects) throw new Error("测试：生成请求失败");
    return { status: "error", files: [], logs: ["测试任务日志"], errorMessage: "测试：输出目录无写入权限" };
  },
  "network:ip-info": () => ({ internal: [], externalIp: "", externalError: "测试：外网请求失败" }),
  "network:domain-ip": () => ({ query: "example.test", host: "example.test", status: "error", addresses: [], errorMessage: "测试：域名解析失败" }),
  "network:certificate-scan": () => { throw new Error("测试：扫描请求失败"); }
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("Toast UI test timed out"); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, "../dist/electron/preload/index.js"),
    contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const click = async selector => {
    await waitFor(`${q(selector)} && !${q(selector)}.disabled`);
    return evaluate(`${q(selector)}.click()`);
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(30); }
    throw new Error(`Timed out: ${expression}`);
  }
  const toast = message => waitFor(`document.querySelector('.workspace-toast')?.textContent.includes(${JSON.stringify(message)})`);
  const close = () => click(".toast-close");
  const setInput = (selector, value) => evaluate(`(() => { const el = ${q(selector)}; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const navigate = async (route, title) => {
    await evaluate(`location.hash = ${JSON.stringify(route)}`);
    await waitFor(`document.querySelector('.tool-header h2')?.textContent === ${JSON.stringify(title)}`);
  };
  const page = path.resolve(__dirname, "../dist/renderer/index.html");
  await win.loadFile(page, { hash: "/qr-code" });
  await toast("上次保存的输出目录已不存在");
  assert.equal(await evaluate("!!document.querySelector('.output-picker-warning')"), false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.workspace-toast-region')).position"), "absolute");
  const footerHeight = await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().height");
  await pause(250);
  fs.writeFileSync(path.join(output, "missing-directory.png"), (await win.webContents.capturePage()).toPNG());
  // Dismissal acknowledges the missing path; timeout alone must not do so.
  await close();
  await waitFor("!document.querySelector('.workspace-toast')");
  assert.equal(saved["/qr-code"].dismissedMissingPath, "C:\\missing-qr");
  assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().height"), footerHeight);
  await win.reload();
  await waitFor("!!document.querySelector('.output-picker')");
  await pause(300);
  assert.equal(await evaluate("!!document.querySelector('.workspace-toast')"), false);

  await navigate("/image-compress", "图片压缩");
  await toast("missing-images");
  // Cancelling a chooser leaves the current selection intact.
  pickedDir = null;
  await click(".toast-action");
  assert.equal(await evaluate("document.querySelector('.output-picker input').value"), "");
  pickedDir = "C:\\test-output";
  await click("[title='选择输出目录']");
  await waitFor("document.querySelector('.output-picker input').value === 'C:\\\\test-output'");
  await click("[title='打开输出目录']");
  await toast("已有目录正在打开");
  await close();
  assert.equal(saved["/image-compress"].dismissedMissingPath, "", "a blocked operation must not dismiss a missing path");
  openStatus = "missing";
  await click("[title='打开输出目录']");
  await toast("当前输出目录已不存在");
  await click(".toast-action");
  await waitFor("!document.querySelector('.workspace-toast')");
  openStatus = "opened";
  await click("[title='打开输出目录']");
  await waitFor("!document.querySelector('[title=\"打开输出目录\"]').disabled");
  assert.equal(saved["/image-compress"].lastOpenedPath, pickedDir);
  pickFails = true;
  await click("[title='选择输出目录']");
  await toast("选择输出目录失败");
  pickFails = false;
  await close();

  await navigate("/qr-code", "二维码生成");
  await click("[title='选择输出目录']");
  await waitFor("!document.querySelector('.task-flow-actions .primary-button').disabled");
  await click(".task-flow-actions .primary-button");
  await toast("输出目录无写入权限");
  assert.equal(await evaluate("!!document.querySelector('.result-content > .error-text')"), false);
  assert.equal(await evaluate("document.querySelector('.log-panel').open"), false);
  await click(".log-panel summary");
  assert.equal(await evaluate("document.querySelector('.log-panel pre').textContent.includes('输出目录无写入权限')"), true);
  await close();
  qrRejects = true;
  await click(".task-flow-actions .primary-button");
  await toast("生成请求失败");
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), false);
  await close();

  for (const [route, title] of [["/audio-compress", "音频压缩"], ["/video-compress", "视频压缩"]]) {
    await navigate(route, title);
    await click(".drop-zone");
    await toast("无法读取媒体信息");
    assert.equal(await evaluate("!!document.querySelector('.task-flow-preview-content > .error-text')"), false);
    await close();
  }
  await navigate("/ip-query", "IP 查询");
  await toast("外网请求失败");
  assert.equal(await evaluate("document.querySelector('.metric-card').textContent.includes('外网请求失败')"), false);
  await close();
  await setInput(".domain-lookup-row input", "example.test");
  await click(".domain-lookup-row .primary-button");
  await toast("域名解析失败");
  assert.equal(await evaluate("!!document.querySelector('.domain-result .empty-state')"), false);
  await close();
  await evaluate("localStorage.setItem('dev-toolbox.certificate-domains.v2', JSON.stringify(['example.test']))");
  await navigate("/certificate-scan", "证书扫描");
  await click(".tool-header .primary-button");
  await toast("扫描请求失败");
  assert.equal(await evaluate("!!document.querySelector('.certificate-error')"), false);
  await close();

  // An asynchronous missing-path check must not show an action for an inactive page.
  saved["/qr-code"] = { selectedPath: "C:\\missing-late" };
  let resolvePath;
  pendingPath = new Promise(resolve => { resolvePath = resolve; });
  await win.loadFile(page, { hash: "/qr-code" });
  await waitFor("!!document.querySelector('.output-picker')");
  await evaluate("location.hash = '/timestamp'");
  await waitFor("location.hash === '#/timestamp' && !document.querySelector('.output-picker')");
  pendingPath = undefined;
  resolvePath();
  await pause(350);
  assert.equal(await evaluate("!!document.querySelector('.workspace-toast')"), false);
  console.log("Toast UI passed: no layout shifts, reselect/cancel/dismiss persistence, inactive-page guard, task details and cross-module errors.");
  win.destroy();
  clearTimeout(watchdog);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
