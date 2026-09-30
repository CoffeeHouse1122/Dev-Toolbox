const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/video-layout-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
let submitted;
let releaseProcessing;
let revealed;
let failNext = false;
const files = ['background.mp4', 'background.webm', 'hls/index.m3u8', 'poster.png', 'background-video.html', ...Array.from({ length: 8 }, (_, i) => `hls/segment-${i}.ts`)].map(file => `C:\\fixtures\\output\\${file.replaceAll('/', '\\')}`);
for (const [channel, handler] of Object.entries({
  'config:load': () => null, 'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'dialog:select-files': () => ['C:\\fixtures\\a-very-long-video-name-for-layout-and-overflow-regression-testing.mp4'],
  'dialog:select-output-dir': () => 'C:\\fixtures\\output',
  'shell:reveal-path': (_event, file) => { revealed = file; },
  'convert:video-background': async (_event, options) => {
    submitted = options;
    await new Promise(resolve => { releaseProcessing = resolve; });
    return failNext ? { status: 'error', files: [], logs: ['模拟转码失败'], errorMessage: '测试失败详情' }
      : { status: 'success', files: options.mode === 'background-pack' ? files : [files[0]], logs: Array.from({ length: 100 }, (_, i) => `模拟转码日志 ${i + 1}`) };
  }
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Video layout timed out'); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, '../dist/electron/preload/index.js'), sandbox: true,
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
  async function setMode(label) {
    await click('.video-form-grid .select-trigger');
    await evaluate(`[...document.querySelectorAll('.select-option')].find(el => el.textContent.includes('${label}')).click()`);
  }
  async function finishProcessing() {
    for (let i = 0; !releaseProcessing && i < 200; i++) await pause(30);
    assert.equal(typeof releaseProcessing, 'function');
    const resolve = releaseProcessing; releaseProcessing = undefined; resolve();
  }
  async function assertFits(label) {
    await pause(180);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    const sizes = await evaluate(`['.video-convert-page', '.task-flow-settings-content', '.task-flow-preview-content', '.result-panel', '.result-content', '.result-panel .file-list'].flatMap(selector => { const el = document.querySelector(selector); return el ? [{ selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }] : []; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const inside = (el, parent) => { const b = el.getBoundingClientRect(); const p = parent.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1 && b.top >= p.top - 1 && b.bottom <= p.bottom + 1; };
      return [...document.querySelectorAll('.video-form-grid .field, .video-check-row, .select-option')].every(el => inside(el, document.querySelector('.task-flow-settings-content'))) &&
        [...document.querySelectorAll('.video-output-item')].every(el => inside(el, document.querySelector('.task-flow-preview-content'))) &&
        [...document.querySelectorAll('.result-panel .file-item, .result-toolbar')].every(el => inside(el, document.querySelector('.result-content')));
    })()`), true, `${label}: all settings, outputs and result actions must be visible`);
    assert.equal(await evaluate("document.querySelectorAll('.video-output-item').length"), 5);
    assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/video-background' });
  await waitFor("!!document.querySelector('.video-convert-page')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
  }
  win.setSize(1280, 768);
  await click('.video-form-grid .select-trigger'); await assertFits('mode-menu');
  await evaluate("document.querySelector('.select-option').click()");
  for (const mode of ['仅 MP4', '仅 WebM', '仅 HLS']) {
    await setMode(mode); await assertFits(mode.replaceAll(' ', '-'));
    assert.equal(await evaluate("document.querySelectorAll('.video-output-item.active').length"), 2);
  }
  await click('.video-check-row');
  assert.equal(await evaluate("document.querySelectorAll('.video-output-item.active').length"), 1);
  await click('.video-check-row'); await setMode('视频完整包');
  await click('.task-flow-source-panel .drop-zone'); await click("[title='选择输出目录']");
  await click('.task-flow-actions .primary-button');
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '运行中'");
  await assertFits('busy'); await finishProcessing();
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '成功'");
  assert.equal(submitted.mode, 'background-pack'); assert.equal(submitted.width, 1280); assert.equal(submitted.crf, 24); assert.equal(submitted.makePoster, true);
  const visited = [];
  for (let page = 0; page < 3; page++) {
    await assertFits(`result-page-${page + 1}`);
    visited.push(...await evaluate("[...document.querySelectorAll('.result-panel .file-item')].map(el => el.title)"));
    if (page < 2) await click('.result-toolbar [title="下一页"]');
  }
  assert.deepEqual(visited, files, 'all HLS segments must remain reachable exactly once');
  await click('.result-panel .file-item');
  for (let i = 0; !revealed && i < 200; i++) await pause(30);
  assert.equal(revealed, files[12]);
  await click('.result-details-button'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.result-dialog-log').textContent.includes('模拟转码日志 100')"), true);
  assert.equal(await evaluate("document.querySelector('.result-toolbar nav').textContent.includes('3 / 3')"), true);
  await assertFits('log-dialog');
  await click('.app-dialog footer button');
  await setMode('仅 MP4'); await click('.task-flow-actions .primary-button');
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '运行中'");
  await finishProcessing(); await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '成功'");
  assert.equal(await evaluate("document.querySelectorAll('.result-panel .file-item').length"), 1, 'new result resets pagination');
  await assertFits('single-file-result');
  failNext = true; await click('.task-flow-actions .primary-button');
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '运行中'");
  await finishProcessing(); await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '失败'");
  await assertFits('failure');
  await click('.result-details-button'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.app-dialog').textContent.includes('测试失败详情')"), true);
  await click('.app-dialog footer button');
  win.setSize(1024, 700); await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.video-convert-page').scrollWidth <= document.querySelector('.video-convert-page').clientWidth + 1"), true);
  console.log('Video layout passed: dimensions/fonts/themes, presets, long filenames, all output cards, result pagination/reveal, logs, failures and small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
