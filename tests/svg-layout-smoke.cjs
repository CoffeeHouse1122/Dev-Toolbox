const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const output = path.resolve(__dirname, "../out/svg-layout-smoke");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-prefers-reduced-motion");
protocol.registerSchemesAsPrivileged([{ scheme: "devtoolbox-file", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const fixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="24" fill="#d5f3ee"/><circle cx="230" cy="180" r="104" fill="#149a9c"/><path d="M340 80L480 280H200Z" fill="#246482" opacity=".8"/></svg>');
let submitted;
let releaseProcessing;
let failNext = false;
for (const [channel, handler] of Object.entries({
  "config:load": () => null, "config:save": (_event, _key, value) => value,
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.8", "update:state": () => ({ status: "disabled", activeTasks: 0 }),
  "dialog:select-files": () => ["C:\\fixtures\\shapes.svg"],
  "dialog:select-output-dir": () => "C:\\fixtures\\output",
  "convert:svg-toolbox": async (_event, options) => {
    submitted = options;
    await new Promise(resolve => { releaseProcessing = resolve; });
    if (failNext) return { status: "error", files: [], logs: [], errorMessage: "测试：SVG 处理失败" };
    return { status: "success", files: [`C:\\fixtures\\output\\shapes.${options.outputFormat}`], logs: [] };
  }
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("SVG layout timed out"); app.exit(1); }, 60_000);
  const images = { svg: fixture, png: await sharp(fixture).png().toBuffer(), webp: await sharp(fixture).webp().toBuffer() };
  protocol.handle("devtoolbox-file", request => {
    const format = request.url.split('.').pop();
    return new Response(images[format], { headers: { "Content-Type": format === 'svg' ? 'image/svg+xml' : `image/${format}` } });
  });
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, "../dist/electron/preload/index.js"), sandbox: true,
    contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(30); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function click(selector) {
    const el = `document.querySelector(${JSON.stringify(selector)})`;
    await waitFor(`${el} && !${el}.disabled`);
    await evaluate(`${el}.click()`);
  }
  async function setFormat(format) {
    await click('.svg-options .select-trigger');
    await evaluate(`[...document.querySelectorAll('.select-option')].find(el => el.textContent.includes('${format}')).click()`);
  }
  async function finishProcessing() {
    for (let i = 0; !releaseProcessing && i < 200; i++) await pause(30);
    assert.equal(typeof releaseProcessing, 'function', 'processing request must reach the fixture');
    const resolve = releaseProcessing;
    releaseProcessing = undefined;
    resolve();
  }
  async function assertFits(label) {
    await pause(180);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    const sizes = await evaluate(`['.svg-page', '.task-flow-settings-content', '.task-flow-preview-content', '.svg-preview-stage', '.result-panel'].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.task-flow-settings-content').getBoundingClientRect();
      return [...document.querySelectorAll('.svg-options .field, .svg-options .check-row, .select-option')].every(el => {
        const box = el.getBoundingClientRect();
        return box.width >= (el.matches('.check-row') ? 24 : 80) && box.left >= panel.left - 1 && box.right <= panel.right + 1 && box.top >= panel.top - 1 && box.bottom <= panel.bottom + 1;
      });
    })()`), true, `${label}: all controls must fit without clipping`);
    assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
    assert.equal(await evaluate("(document.querySelector('.result-panel .empty-state') || document.querySelector('.result-panel .result-content')).clientHeight >= 40"), true, "result area must not collapse");
    assert.equal(await evaluate(`(() => {
      const img = document.querySelector('.svg-preview-stage img'); if (!img) return true;
      const image = img.getBoundingClientRect(); const box = img.parentElement.getBoundingClientRect();
      return img.complete && img.naturalWidth > 0 && image.height >= 100 && image.width >= 100 && getComputedStyle(img).objectFit === 'contain' && image.left >= box.left && image.right <= box.right && image.top >= box.top && image.bottom <= box.bottom;
    })()`), true, "output image must load and fit without cropping");
  }
  await win.loadFile(path.resolve(__dirname, "../dist/renderer/index.html"), { hash: "/svg-toolbox" });
  await waitFor("!!document.querySelector('.svg-options')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    for (const format of ['SVG', 'PNG', 'WebP']) {
      await setFormat(format);
      await assertFits(`${width}-${height}-${font}-${format}`);
    }
  }
  win.setSize(1280, 768);
  await click('.svg-options .select-trigger');
  await assertFits('format-menu');
  await evaluate("document.querySelector('.select-option').click()");
  await click('.task-flow-source-panel .drop-zone');
  await click("[title='选择输出目录']");
  await evaluate("[...document.querySelectorAll('.svg-options .check-row')].find(el => el.textContent.includes('移除固定宽高')).click()");
  for (const format of ['SVG', 'PNG', 'WebP']) {
    await setFormat(format);
    if (format !== 'SVG') await evaluate("document.querySelectorAll('.svg-options input[type=number]').forEach(el => { el.value = '8192'; el.dispatchEvent(new Event('input', { bubbles: true })); })");
    await click('.task-flow-actions .primary-button');
    await waitFor("document.querySelector('.task-flow-actions .primary-button').textContent.includes('处理中')");
    await assertFits(`busy-${format}`);
    await finishProcessing();
    await waitFor(`document.querySelector('.svg-preview-stage img')?.src.endsWith('.${format.toLowerCase()}') && document.querySelector('.svg-preview-stage img').naturalWidth > 0 && document.querySelector('.result-panel .status-pill')?.textContent === '成功'`);
    await assertFits(`result-${format}`);
    assert.equal(submitted.outputFormat, format.toLowerCase());
    assert.equal(submitted.removeDimensions, format === 'SVG');
    assert.equal(submitted.cleanupIds, true);
    assert.equal(submitted.precision, 2);
    assert.equal(submitted.width, format === 'SVG' ? undefined : 8192);
    assert.equal(submitted.quality, format === 'WebP' ? 88 : undefined);
  }
  failNext = true;
  await click('.task-flow-actions .primary-button');
  await waitFor("document.querySelector('.task-flow-actions .primary-button').textContent.includes('处理中')");
  await finishProcessing();
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '失败'");
  await assertFits('failure');
  win.setSize(1024, 700);
  await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.svg-page').scrollWidth <= document.querySelector('.svg-page').clientWidth + 1"), true);
  console.log('SVG layout passed: dimensions/fonts/themes, all three formats, raster controls, output previews, busy/error states and small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
