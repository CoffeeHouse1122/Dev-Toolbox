const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const QRCode = require("qrcode");

const output = path.resolve(__dirname, "../out/qrcode-layout-smoke");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-prefers-reduced-motion");
protocol.registerSchemesAsPrivileged([{ scheme: "devtoolbox-file", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let submitted;
let imageBody;
let imageType;
let releaseGeneration;
for (const [channel, handler] of Object.entries({
  "config:load": () => null,
  "config:save": (_event, _key, value) => value,
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.8",
  "update:state": () => ({ status: "disabled", activeTasks: 0 }),
  "dialog:select-output-dir": () => "C:\\fixtures\\output",
  "qr:generate": async (_event, options) => {
    releaseGeneration = undefined;
    submitted = options;
    const settings = { width: options.size, margin: options.margin, color: { dark: options.darkColor, light: options.lightColor } };
    imageBody = options.format === "svg"
      ? await QRCode.toString(options.text, { ...settings, type: "svg" })
      : await QRCode.toBuffer(options.text, settings);
    imageType = options.format === "svg" ? "image/svg+xml" : "image/png";
    await new Promise(resolve => { releaseGeneration = resolve; });
    return { status: "success", files: [`C:\\fixtures\\output\\${options.fileName}.${options.format}`], logs: [] };
  }
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("QR layout timed out"); app.exit(1); }, 60_000);
  protocol.handle("devtoolbox-file", () => new Response(imageBody, { headers: { "Content-Type": imageType } }));
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
  async function click(selector) {
    const target = `document.querySelector(${JSON.stringify(selector)})`;
    await waitFor(`${target} && !${target}.disabled`);
    await evaluate(`${target}.click()`);
  }
  async function setValue(selector, value) {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  async function assertFits(label) {
    await pause(180);
    const dimensions = await evaluate(`['.qr-page', '.task-flow-settings-content', '.task-flow-preview-content', '.qr-preview-stage', '.result-panel', '.qr-options'].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight }; })`);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    assert.ok(dimensions.every(item => item.scrollWidth <= item.width + 1 && item.scrollHeight <= item.height + 1), `${label}: ${JSON.stringify(dimensions)}`);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.task-flow-settings-content').getBoundingClientRect();
      return [...document.querySelectorAll('.qr-options input, .qr-options button')].every(el => {
        const box = el.getBoundingClientRect();
        return box.width >= 80 && box.height >= 30 && box.left >= panel.left - 1 && box.right <= panel.right + 1 && box.top >= panel.top - 1 && box.bottom <= panel.bottom + 1;
      });
    })()`), true, `${label}: controls must remain fully visible and usable`);
    assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
    assert.equal(await evaluate("(document.querySelector('.result-panel .empty-state') || document.querySelector('.result-panel .result-content')).clientHeight >= 40"), true, "result content must not collapse");
    assert.equal(await evaluate("[...document.querySelectorAll('.qr-preview-stage img')].every(img => img.complete && img.naturalWidth > 0 && img.clientWidth >= 100 && img.clientHeight >= 100 && getComputedStyle(img).objectFit === 'contain')"), true, "preview image must load and fit without cropping");
  }
  await win.loadFile(path.resolve(__dirname, "../dist/renderer/index.html"), { hash: "/qr-code" });
  await waitFor("!!document.querySelector('.qr-options')");
  for (const [width, height, theme, font] of [[1280, 820, "dark", "system"], [1280, 820, "dark", "wdxl-lubrifont"], [1280, 768, "light", "system"], [1366, 768, "light", "system"], [1440, 900, "dark", "system"]]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`${width}-${height}-${theme}-${font}`);
  }
  win.setSize(1280, 768);
  await click("[title='选择输出目录']");
  for (const format of ["png", "svg"]) {
    await click(".qr-options .select-trigger");
    await assertFits(`menu-${format}`);
    await evaluate(`[...document.querySelectorAll('.select-option')].find(el => el.textContent.includes('${format.toUpperCase()}')).click()`);
    await click(".task-flow-actions .primary-button");
    await waitFor("document.querySelector('.task-flow-actions .primary-button').textContent.includes('生成中')");
    await assertFits(`busy-${format}`);
    for (let i = 0; !releaseGeneration && i < 200; i++) await pause(30);
    assert.ok(releaseGeneration, "generation fixture must be ready");
    releaseGeneration();
    await waitFor(`document.querySelector('.qr-preview-stage img')?.src.endsWith('.${format}') && document.querySelector('.qr-preview-stage img').naturalWidth > 0 && document.querySelector('.result-panel .status-pill')?.textContent === '成功'`);
    await assertFits(`result-${format}`);
    assert.equal(submitted.format, format);
    assert.equal(submitted.text, "https://github.com/");
    assert.equal(submitted.size, 512);
  }
  await setValue('.qr-options .field:nth-child(5) input', '#ffffff');
  await assertFits("invalid-color");
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  await setValue('.qr-options .field:nth-child(5) input', '#1f2328');
  await setValue('.qr-source-textarea', '');
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  win.setSize(1024, 700);
  await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), "visible");
  assert.equal(await evaluate("document.querySelector('.qr-page').scrollWidth <= document.querySelector('.qr-page').clientWidth + 1"), true);
  console.log("QR layout passed: desktop dimensions/fonts/themes, complete controls, PNG/SVG preview, loading/results, validation and small-window fallback.");
  win.destroy();
  clearTimeout(watchdog);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
