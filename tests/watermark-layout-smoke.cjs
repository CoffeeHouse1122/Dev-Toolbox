const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.resolve(__dirname, "../out/watermark-layout-smoke");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-prefers-reduced-motion");
let selectedFiles = ["C:\\fixtures\\source.png"];
let submitted;
for (const [channel, handler] of Object.entries({
  "config:load": () => null, "config:save": (_e, _key, value) => value,
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.8", "update:state": () => ({ status: "disabled", activeTasks: 0 }),
  "dialog:select-files": () => selectedFiles,
  "dialog:select-output-dir": () => "C:\\fixtures\\output",
  "base64:image-to-base64": () => ({ dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" }),
  "convert:watermark": (_e, options) => { submitted = options; return { status: "success", files: ["C:\\fixtures\\output\\source.png"], logs: [] }; }
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("Watermark layout timed out"); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, frame: false, webPreferences: {
    preload: path.resolve(__dirname, "../dist/electron/preload/index.js"),
    sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(30); }
    throw new Error(`Timed out: ${expression}`);
  }
  const click = async selector => {
    const q = `document.querySelector(${JSON.stringify(selector)})`;
    await waitFor(`${q} && !${q}.disabled`);
    await evaluate(`${q}.click()`);
  };
  async function assertFits(label) {
    await pause(180);
    const sizes = await evaluate(`['.watermark-page', '.task-flow-settings-content', '.task-flow-preview-content', '.task-flow-result-slot .result-panel', '.watermark-content-grid', '.watermark-options'].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight }; })`);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    assert.ok(sizes.every(item => item.scrollWidth <= item.width + 1 && item.scrollHeight <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('.watermark-content-grid, .watermark-options')].every(el => { const box = el.getBoundingClientRect(); const panel = document.querySelector('.task-flow-settings-content').getBoundingClientRect(); return box.top >= panel.top - 1 && box.bottom <= panel.bottom + 1; })"), true, "controls must fit without clipping");
  }
  await win.loadFile(path.resolve(__dirname, "../dist/renderer/index.html"), { hash: "/watermark" });
  await waitFor("!!document.querySelector('.watermark-options')");
  await evaluate("document.fonts.ready");
  for (const [width, height, theme, font] of [[1280, 820, "dark", "system"], [1280, 820, "dark", "wdxl-lubrifont"], [1280, 768, "dark", "system"], [1366, 768, "light", "system"], [1440, 900, "light", "system"]]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`${width}-${height}-${theme}-${font}`);
  }
  win.setSize(1280, 820);
  await click(".task-flow-source-panel .drop-zone");
  selectedFiles = ["C:\\fixtures\\a-very-long-pattern-filename-that-should-not-expand-the-panel.png"];
  await click(".watermark-pattern-row .drop-zone");
  await waitFor("!document.querySelector('[title=\"移除图案\"]').disabled");
  await assertFits("with-pattern");
  win.setSize(1366, 768);
  await assertFits("with-pattern-1366-768");
  await evaluate("document.querySelector('.watermark-text').value = ''; document.querySelector('.watermark-text').dispatchEvent(new Event('input', { bubbles: true }))");
  assert.equal(await evaluate("document.querySelector('.watermark-plan dl').textContent.includes('文字 + 图案')"), false);
  await click(".watermark-options .select-trigger");
  await assertFits("position-menu-1366-768");
  assert.equal(await evaluate("[...document.querySelectorAll('.select-option')].every(el => el.getBoundingClientRect().bottom <= document.querySelector('.task-flow-settings-content').getBoundingClientRect().bottom)"), true, "position choices remain visible");
  await evaluate("[...document.querySelectorAll('.select-option')].find(el => el.textContent.includes('右下角')).click()");
  await waitFor("!document.querySelector('.watermark-options input[type=number]').disabled");
  assert.equal(await evaluate("document.querySelector('[role=slider][aria-label=\"铺满间距\"]').getAttribute('aria-disabled')"), "true");
  await click("[title='选择输出目录']");
  await click(".task-flow-actions .primary-button");
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '成功'");
  assert.equal(submitted.position, "bottom-right");
  assert.equal(submitted.patternPath, selectedFiles[0]);
  assert.equal(submitted.text, "");
  await assertFits("with-result");
  await click("[title='移除图案']");
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  win.setSize(1024, 700);
  await pause(200);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), "visible");
  assert.equal(await evaluate("document.querySelector('.watermark-page').scrollWidth <= document.querySelector('.watermark-page').clientWidth + 1"), true);
  console.log("Watermark layout passed: desktop sizes/themes/fonts, image selection, output plan, controls, submission and small-window fallback.");
  win.destroy();
  clearTimeout(watchdog);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
