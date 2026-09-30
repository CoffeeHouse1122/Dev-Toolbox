const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/og-image-layout-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
let submitted, releaseProcessing, revealed;
let failNext = false;
for (const [channel, handler] of Object.entries({
  'config:load': () => null, 'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'dialog:select-output-dir': () => 'C:\\fixtures\\og-output',
  'shell:reveal-path': (_event, file) => { revealed = file; },
  'seo:og-image': async (_event, options) => {
    submitted = options; await new Promise(resolve => { releaseProcessing = resolve; });
    return failNext ? { status: 'error', files: [], logs: [], errorMessage: '测试：OG 生成失败' } : {
      status: 'success', files: [`${options.outputDir}\\${options.fileName}.png`],
      logs: Array.from({ length: 100 }, (_, i) => `模拟生成日志 ${i + 1}`)
    };
  }
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('OG layout timed out'); app.exit(1); }, 60_000);
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
    await waitFor(`${el} && !${el}.disabled`); await evaluate(`${el}.click()`);
  }
  async function setField(index, value) {
    await evaluate(`{ const el = document.querySelectorAll('.og-source-grid input, .og-options input')[${index}]; el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event('input', { bubbles: true })); }`);
  }
  async function finish() {
    for (let i = 0; !releaseProcessing && i < 200; i++) await pause(30);
    assert.equal(typeof releaseProcessing, 'function'); const resolve = releaseProcessing; releaseProcessing = undefined; resolve();
    await waitFor("document.querySelector('.result-panel .status-pill')?.textContent !== '运行中'");
  }
  async function assertFits(label, ratio = 1200 / 630) {
    await pause(200);
    const sizes = await evaluate(`['.og-image-page', '.task-flow-settings-content', '.task-flow-preview-content', '.og-preview-stage', '.result-panel', '.result-content'].flatMap(selector => { const el = document.querySelector(selector); return el ? [{ selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }] : []; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    const actualRatio = await evaluate("(() => { const b = document.querySelector('.og-preview-card').getBoundingClientRect(); return b.width / b.height; })()");
    assert.ok(Math.abs(actualRatio - ratio) / ratio < 0.01, `${label}: preview aspect ratio ${actualRatio}, expected ${ratio}`);
    assert.equal(await evaluate(`(() => {
      const inside = (el, parent) => { const b = el.getBoundingClientRect(); const p = parent.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1 && b.top >= p.top - 1 && b.bottom <= p.bottom + 1; };
      return [...document.querySelectorAll('.og-options input')].every(el => inside(el, document.querySelector('.task-flow-settings-content'))) &&
        inside(document.querySelector('.og-preview-card'), document.querySelector('.og-preview-stage')) &&
        [...document.querySelectorAll('.og-preview-card h3, .og-preview-card p, .og-preview-site, .og-preview-card small')].every(el => inside(el, document.querySelector('.og-preview-card'))) &&
        document.querySelector('.result-panel').getBoundingClientRect().bottom < document.querySelector('.task-flow-action-bar').getBoundingClientRect().top &&
        document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight;
    })()`), true, `${label}: controls, full preview text, results and footer must fit`);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/og-image' });
  await waitFor("!!document.querySelector('.og-image-page')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
  }
  win.setSize(1280, 768);
  for (const [width, height] of [[1080, 1080], [630, 1200], [2400, 240], [320, 1600], [1200, 630]]) {
    await setField(4, width); await setField(5, height); await assertFits(`ratio-${width}-${height}`, width / height);
  }
  await setField(0, '分享页面预览'); await setField(1, '标题与配色实时更新');
  await setField(6, '#112233'); await setField(7, '#22aabb'); await setField(8, '#ffffff');
  assert.equal(await evaluate("document.querySelector('.og-preview-copy h3').textContent"), '分享页面预览');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.og-preview-card')).backgroundColor"), 'rgb(17, 34, 51)');
  await setField(2, 'a-very-long-output-file-name-that-must-not-push-the-footer-offscreen');
  await assertFits('live-preview-long-filename');
  await click('[title="选择输出目录"]'); await click('.task-flow-actions .primary-button'); await assertFits('busy'); await finish();
  assert.equal(submitted.title, '分享页面预览'); assert.equal(submitted.width, 1200); assert.equal(submitted.height, 630); assert.equal(submitted.accentColor, '#22aabb');
  await assertFits('success'); await click('.result-panel .file-item');
  for (let i = 0; !revealed && i < 200; i++) await pause(30);
  assert.equal(revealed, `${submitted.outputDir}\\${submitted.fileName}.png`);
  await click('.result-details-button'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.result-dialog-log').textContent.includes('模拟生成日志 100')"), true);
  await assertFits('log-dialog'); await click('.app-dialog footer button');
  failNext = true; await click('.task-flow-actions .primary-button'); await finish(); await assertFits('failure');
  await setField(0, ''); assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  win.setSize(1024, 700); await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.og-image-page').scrollWidth <= document.querySelector('.og-image-page').clientWidth + 1"), true);
  console.log('OG layout passed: sizes/fonts/themes, complete controls, proportional wide/tall/square previews, live colors/text, long filenames, submit/reveal, logs/errors and small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
