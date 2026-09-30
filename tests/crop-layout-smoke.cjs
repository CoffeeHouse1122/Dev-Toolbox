const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.resolve(__dirname, "../out/crop-layout-smoke");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-prefers-reduced-motion");
const dimensions = { landscape: [1600, 900], portrait: [600, 1200], panorama: [2400, 300] };
let selectedFiles = [];
const submissions = [];
for (const [channel, handler] of Object.entries({
  "config:load": () => null, "config:save": (_event, _key, value) => value,
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.8", "update:state": () => ({ status: "disabled", activeTasks: 0 }),
  "dialog:select-files": () => selectedFiles,
  "dialog:select-output-dir": () => "C:\\fixtures\\output",
  "base64:image-to-base64": (_event, file) => {
    const [width, height] = dimensions[path.basename(file, ".png")];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#d2f0ef"/><path d="M100 0H0V100" fill="none" stroke="#277d86" stroke-width="3"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#158e99"/></svg>`;
    return { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
  },
  "convert:image-crop": (_event, options) => {
    submissions.push(options);
    return { status: "success", files: [`C:\\fixtures\\output\\${path.basename(options.inputPath)}`], logs: [] };
  }
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("Crop layout timed out"); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 820, webPreferences: {
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
    const el = `document.querySelector(${JSON.stringify(selector)})`;
    await waitFor(`${el} && !${el}.disabled`);
    await evaluate(`${el}.click()`);
  }
  async function assertFits(label) {
    await pause(180);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    const sizes = await evaluate(`['.crop-page', '.task-flow-settings-content', '.task-flow-preview-content', '.crop-viewport', '.result-panel'].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.task-flow-settings-content').getBoundingClientRect();
      return [...document.querySelectorAll('.crop-options .field, .crop-stats, .select-option')].every(el => {
        const box = el.getBoundingClientRect();
        return box.left >= panel.left - 1 && box.right <= panel.right + 1 && box.top >= panel.top - 1 && box.bottom <= panel.bottom + 1;
      });
    })()`), true, "settings remain fully visible");
    assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
    assert.equal(await evaluate("(document.querySelector('.result-panel .empty-state') || document.querySelector('.result-panel .result-content')).clientHeight >= 40"), true);
    assert.equal(await evaluate(`(() => {
      const img = document.querySelector('.crop-image'); if (!img) return true;
      const stage = document.querySelector('.crop-stage').getBoundingClientRect();
      const view = document.querySelector('.crop-viewport').getBoundingClientRect();
      const image = img.getBoundingClientRect();
      return document.querySelectorAll('.crop-handle').length === 8 && img.naturalWidth > 0 && Math.abs(stage.width / stage.height - img.naturalWidth / img.naturalHeight) < 0.01 &&
        Math.abs(stage.width - image.width) < 1 && Math.abs(stage.height - image.height) < 1 &&
        stage.width > 20 && stage.height > 20 && stage.left >= view.left && stage.right <= view.right && stage.top >= view.top && stage.bottom <= view.bottom &&
        [...document.querySelectorAll('.crop-handle')].every(el => { const b = el.getBoundingClientRect(); return b.left >= view.left && b.right <= view.right && b.top >= view.top && b.bottom <= view.bottom; });
    })()`), true, "image, coordinate surface and all eight handles must fit");
  }
  async function drag(selector, start, end) {
    await evaluate(`(() => {
      const rect = document.querySelector('.crop-stage').getBoundingClientRect();
      const event = (type, point) => new PointerEvent(type, { bubbles: true, clientX: rect.left + rect.width * point[0], clientY: rect.top + rect.height * point[1], pointerId: 1 });
      document.querySelector(${JSON.stringify(selector)}).dispatchEvent(event('pointerdown', ${JSON.stringify(start)}));
      window.dispatchEvent(event('pointermove', ${JSON.stringify(end)}));
      window.dispatchEvent(event('pointerup', ${JSON.stringify(end)}));
    })()`);
  }
  await win.loadFile(path.resolve(__dirname, "../dist/renderer/index.html"), { hash: "/image-crop" });
  await waitFor("!!document.querySelector('.crop-options')");
  for (const [width, height, theme, font] of [[1280, 820, "dark", "system"], [1280, 820, "dark", "wdxl-lubrifont"], [1280, 768, "light", "system"], [1366, 768, "light", "system"], [1440, 900, "dark", "system"]]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
  }
  win.setSize(1280, 768);
  await click(".crop-options .select-trigger");
  await assertFits("format-menu");
  await evaluate("[...document.querySelectorAll('.select-option')].find(el => el.textContent.includes('WebP')).click()");
  for (const name of Object.keys(dimensions)) {
    selectedFiles = [`C:\\fixtures\\${name}.png`];
    await click(".task-flow-source-panel .drop-zone");
    await waitFor(`document.querySelector('.crop-image')?.naturalWidth === ${dimensions[name][0]}`);
    await assertFits(name);
    await drag('.crop-stage', [0, 0], [1, 1]);
    await assertFits(`${name}-full-selection`);
    await click(".task-flow-source-panel [title='移除']");
  }
  selectedFiles = ["C:\\fixtures\\landscape.png", "C:\\fixtures\\portrait.png"];
  await click(".task-flow-source-panel .drop-zone");
  await waitFor("document.querySelector('.crop-image')?.naturalWidth === 1600");
  await pause(180);
  await drag('.crop-stage', [.2, .2], [.7, .7]);
  await drag('.crop-selection', [.4, .4], [.5, .5]);
  await drag('.crop-handle-se', [.8, .8], [.9, .9]);
  win.setSize(1440, 900);
  await assertFits("resized-selection");
  assert.equal(await evaluate("document.querySelector('.drop-file-list').scrollWidth <= document.querySelector('.drop-file-list').clientWidth + 1"), true, "two selected files should fit the source strip");
  await click("[title='选择输出目录']");
  await click(".task-flow-actions .primary-button");
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '成功'");
  assert.equal(submissions.length, 2);
  for (const item of submissions) {
    const [width, height] = dimensions[path.basename(item.inputPath, '.png')];
    assert.equal(item.outputFormat, 'webp');
    assert.equal(item.quality, 92);
    for (const [key, expected] of Object.entries({ x: width * .3, y: height * .3, width: width * .6, height: height * .6 })) assert.ok(Math.abs(item[key] - expected) <= 1, `${key}: ${item[key]} vs ${expected}`);
  }
  await assertFits("batch-result");
  win.setSize(1024, 700);
  await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), "visible");
  assert.equal(await evaluate("document.querySelector('.crop-page').scrollWidth <= document.querySelector('.crop-page').clientWidth + 1"), true);
  console.log("Crop layout passed: dimensions/fonts/themes, landscape/portrait/panorama, edge handles, draw/move/resize, resize stability and batch crop coordinates.");
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
