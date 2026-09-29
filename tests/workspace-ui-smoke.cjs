const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.resolve(__dirname, "../out/workspace-ui-smoke");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-prefers-no-reduced-motion");
const calls = [];
const config = { sharePath: "\\\\files.example.test\\素材", defaultDirectory: "", authMode: "account", username: "DOMAIN\\tester", password: "", rememberCredentials: true, hasSavedPassword: true, migrationNotice: "旧配置已转换为 SMB 路径；Windows 凭据未更改。" };
const status = { connected: true, state: "connected", shareRoot: config.sharePath, username: config.username, message: "检测到 Windows 已有连接，可直接打开，无需重复登录", sessions: [{ shareRoot: config.sharePath, username: config.username, openFiles: 1 }] };
for (const [channel, handler] of Object.entries({
  "config:load": () => null, "config:save": (_e, _key, value) => value,
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.7", "update:state": () => ({ status: "disabled", activeTasks: 0 }),
  "shared-disk:load": () => config, "shared-disk:status": () => status,
  "shared-disk:open-existing": (_e, value) => { calls.push(["open", value]); return value.sharePath; },
  "shared-disk:connect": (_e, value) => {
    calls.push(["connect", value]);
    Object.assign(config, value);
    Object.assign(status, { connected: true, state: "connected" });
    return { shareRoot: config.sharePath, baseUncPath: config.sharePath, defaultDirectory: config.sharePath, message: "共享已连接" };
  },
  "shared-disk:open": (_e, value) => { calls.push(["open-after-connect", value]); return value; },
  "shared-disk:disconnect": () => { calls.push(["disconnect"]); throw new Error("断开后 Windows 仍报告该共享已连接，尚无法确认具体原因；应用未强制断开连接"); },
  "shared-disk:forget": () => { calls.push(["forget"]); return { ...config, hasSavedPassword: false }; }
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("Workspace UI test timed out"); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, frame: false, webPreferences: {
    preload: path.resolve(__dirname, "../dist/electron/preload/index.js"), contextIsolation: true, sandbox: true,
    nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const errors = [];
  win.webContents.on("console-message", (_e, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = async script => {
    try { return await win.webContents.executeJavaScript(script); }
    catch (error) { throw new Error(`${error.message}; script=${script}; errors=${JSON.stringify(errors)}`); }
  };
  const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const click = selector => evaluate(`${q(selector)}.click()`);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(50); }
    throw new Error(`Timed out: ${expression}; errors=${JSON.stringify(errors)}`);
  }
  const screenshot = async name => fs.writeFileSync(path.join(output, name + ".png"), (await win.webContents.capturePage()).toPNG());
  if (process.env.WORKSPACE_UI_DEV_URL) await win.loadURL(process.env.WORKSPACE_UI_DEV_URL + "/#/shared-disk");
  else await win.loadFile(path.resolve(__dirname, "../dist/renderer/index.html"), { hash: "/shared-disk" });
  await waitFor("document.querySelector('.shared-primary-action')?.textContent.trim() === '打开目录' && !document.querySelector('.shared-primary-action').disabled");
  assert.equal(await evaluate("document.querySelectorAll('.shared-connection .primary-button').length"), 1);
  assert.equal(await evaluate("!!document.querySelector('.open-existing, .connect-action')"), false);
  await evaluate("document.documentElement.dataset.uiFont = 'wdxl-lubrifont'; document.fonts.ready");
  await pause(350);
  assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
  assert.equal(await evaluate("document.querySelector('.task-flow-settings-content').scrollHeight <= document.querySelector('.task-flow-settings-content').clientHeight + 1"), true);
  assert.equal(await evaluate("!!document.querySelector('.connection-notice, .confirm-box')"), false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.workspace-toast-region')).position"), "absolute");
  assert.equal(await evaluate("!!document.querySelector('.workspace-toast')"), false, "loading migrated config must not display a migration toast");
  await screenshot("shared");
  await click(".shared-primary-action");
  await waitFor("!document.querySelector('.shared-primary-action').disabled");
  assert.deepEqual(calls, [["open", { sharePath: config.sharePath, defaultDirectory: "" }]]);
  await waitFor("document.querySelector('.workspace-toast')?.textContent.includes('已使用 Windows 现有连接')");
  const height = await evaluate("document.querySelector('.shared-connection').getBoundingClientRect().height");
  await evaluate("document.querySelector('.disconnect-action').focus(); document.querySelector('.disconnect-action').click()");
  await waitFor("document.querySelector('.app-dialog')?.matches(':modal')");
  assert.equal(await evaluate("document.querySelector('.shared-connection').getBoundingClientRect().height"), height);
  assert.equal(await evaluate("document.activeElement.textContent.trim()"), "取消");
  await screenshot("confirmation");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitFor("!document.querySelector('.app-dialog').open");
  assert.equal(calls.length, 1);
  await click(".disconnect-action");
  await waitFor("document.querySelector('.app-dialog').open");
  await click(".confirm-action");
  await waitFor("!!document.querySelector('.error-detail')");
  await click(".error-detail");
  await waitFor("document.querySelector('.app-dialog').textContent.includes('Windows 仍报告该共享已连接')");
  await click(".app-dialog .secondary-button");
  await click(".forget-action");
  await waitFor("document.querySelector('.app-dialog').open");
  await click(".confirm-action");
  await waitFor("document.querySelector('.forget-action').disabled && !document.querySelector('.app-dialog').open");
  assert.deepEqual(calls.map(call => call[0]), ["open", "disconnect", "forget"]);
  // Existing sessions stay usable without stored passwords; never re-authenticate implicitly.
  await waitFor("!document.querySelector('.shared-primary-action').disabled");
  await click(".shared-primary-action");
  await waitFor("!document.querySelector('.shared-primary-action').disabled");
  assert.equal(calls.at(-1)[0], "open");
  Object.assign(status, { connected: false, state: "disconnected", sessions: [], message: "尚未连接该共享" });
  await click("[aria-label='刷新连接状态']");
  await waitFor("document.querySelector('.shared-primary-action').textContent.trim() === '连接并打开'");
  assert.equal(await evaluate("document.querySelector('.shared-primary-action').disabled"), true, "account login requires a password when disconnected");
  await click(".auth-options button:first-child");
  await waitFor("!document.querySelector('.shared-primary-action').disabled");
  await pause(250);
  await screenshot("shared-disconnected");
  await click(".shared-primary-action");
  await waitFor("document.querySelector('.shared-primary-action').textContent.trim() === '打开目录' && !document.querySelector('.shared-primary-action').disabled");
  assert.deepEqual(calls.slice(-2).map(call => call[0]), ["connect", "open-after-connect"]);
  assert.equal(calls.at(-2)[1].authMode, "windows");
  assert.equal(calls.at(-2)[1].password, "");
  assert.equal(await evaluate("document.querySelectorAll('.shared-connection .primary-button').length"), 1);
  const links = Array.from({ length: 21 }, (_, i) => ({ id: `fixture-${i}`, title: `文档 ${i}`, url: `https://example.test/docs/${i}`, category: i % 2 ? "技术文档" : "工具", description: "仅用于隔离测试的示例链接" }));
  await evaluate(`localStorage.setItem('dev-toolbox.links.v1', ${JSON.stringify(JSON.stringify(links))}); location.hash = '/links'`);
  await waitFor("document.querySelectorAll('.link-card').length === 21");
  const visibleCards = "[...document.querySelectorAll('.link-card')].every(el => getComputedStyle(el).opacity === '1' && getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().height > 50)";
  // Hover during mount/filter must not leave cards transparent.
  await evaluate("document.querySelectorAll('.link-card').forEach(el => { el.dispatchEvent(new MouseEvent('mouseenter')); el.dispatchEvent(new MouseEvent('mouseleave')); })");
  await pause(400);
  assert.equal(await evaluate(visibleCards), true);
  await click(".link-card [title='下移']");
  await waitFor("document.querySelector('.link-card strong').textContent === '文档 1'");
  await evaluate("(() => { const input = document.querySelector('.links-search-field input'); input.value = '文档 20'; input.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await waitFor("document.querySelectorAll('.link-card').length === 1");
  assert.equal(await evaluate(visibleCards), true);
  await evaluate("(() => { const input = document.querySelector('.links-search-field input'); input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await click(".links-category-tabs button:nth-child(2)");
  await waitFor("document.querySelectorAll('.link-card').length < 21");
  assert.equal(await evaluate(visibleCards), true);
  await click(".links-category-tabs button:first-child");
  await evaluate("location.hash = '/shared-disk'");
  await waitFor("!!document.querySelector('.shared-connection')");
  await evaluate("location.hash = '/links'");
  await waitFor("document.querySelectorAll('.link-card').length === 21");
  await pause(400); assert.equal(await evaluate(visibleCards), true); await screenshot("links");
  assert.deepEqual(errors, []);
  console.log("Workspace UI passed: one-screen layout, floating notices, modal cancel/confirm, existing-session open, error details, visible links after hover/filter/reorder/navigation.");
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
