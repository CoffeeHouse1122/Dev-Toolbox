const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/seo-files-layout-smoke');
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
  'dialog:select-output-dir': () => 'C:\\fixtures\\seo-output',
  'shell:reveal-path': (_event, file) => { revealed = file; },
  'seo:files': async (_event, options) => {
    submitted = options;
    await new Promise(resolve => { releaseProcessing = resolve; });
    return failNext ? { status: 'error', files: [], logs: [], errorMessage: '测试：SEO 生成失败' } : {
      status: 'success', files: [options.includeRobots && 'robots.txt', options.includeSitemap && 'sitemap.xml'].filter(Boolean).map(file => `${options.outputDir}\\${file}`),
      logs: Array.from({ length: 100 }, (_, i) => `模拟生成日志 ${i + 1}`)
    };
  }
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('SEO layout timed out'); app.exit(1); }, 60_000);
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
  async function finish() {
    for (let i = 0; !releaseProcessing && i < 200; i++) await pause(30);
    assert.equal(typeof releaseProcessing, 'function');
    const resolve = releaseProcessing; releaseProcessing = undefined; resolve();
    await waitFor("document.querySelector('.result-panel .status-pill')?.textContent !== '运行中'");
  }
  async function assertFits(label) {
    await pause(180);
    const sizes = await evaluate(`['.seo-files-page', '.task-flow-settings-content', '.seo-options', '.result-panel', '.result-content', '.seo-path-field:nth-last-child(2) textarea', '.seo-path-field:last-child textarea'].flatMap(selector => { const el = document.querySelector(selector); return el ? [{ selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }] : []; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.task-flow-settings-content').getBoundingClientRect();
      return [...document.querySelectorAll('.seo-options input, .seo-options textarea, .seo-options button')].every(el => { const b = el.getBoundingClientRect(); return b.left >= panel.left - 1 && b.right <= panel.right + 1 && b.top >= panel.top - 1 && b.bottom <= panel.bottom + 1; }) &&
        document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight;
    })()`), true, `${label}: full controls, dropdown and footer`);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/seo-files' });
  await waitFor("!!document.querySelector('.seo-files-page')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
    await click('.select-trigger'); await assertFits(`menu-${width}-${height}-${font}`);
    assert.equal(await evaluate("document.querySelectorAll('.select-option').length"), 7);
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  }
  win.setSize(1280, 768);
  await click('[title="选择输出目录"]');
  await click('[aria-label="robots.txt"]'); await click('[aria-label="sitemap.xml"]');
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  await click('[aria-label="robots.txt"]');
  await click('.task-flow-actions .primary-button'); await assertFits('busy'); await finish();
  assert.equal(submitted.includeSitemap, false); assert.equal(submitted.includeRobots, true);
  await assertFits('robots-result');
  await click('[aria-label="robots.txt"]'); await click('[aria-label="sitemap.xml"]');
  await click('.task-flow-actions .primary-button'); await finish();
  assert.equal(submitted.includeSitemap, true); assert.equal(submitted.includeRobots, false);
  await assertFits('sitemap-result');
  await click('[aria-label="robots.txt"]');
  await click('.select-trigger'); await evaluate("[...document.querySelectorAll('.select-option')].find(el => el.textContent.trim() === 'daily').click()");
  await evaluate("document.querySelector('.seo-options input').value = '0.6'; document.querySelector('.seo-options input').dispatchEvent(new Event('input', { bubbles: true }))");
  await click('.task-flow-actions .primary-button'); await finish();
  assert.equal(submitted.changefreq, 'daily'); assert.equal(submitted.priority, '0.6');
  assert.equal(submitted.pages, '/\n/about\n/contact'); assert.equal(submitted.disallow, '/admin\n/private');
  assert.equal(await evaluate("document.querySelectorAll('.result-panel .file-item').length"), 2);
  await assertFits('both-results');
  await click('.result-panel .file-item');
  for (let i = 0; !revealed && i < 200; i++) await pause(30);
  assert.equal(revealed, 'C:\\fixtures\\seo-output\\robots.txt');
  await click('.result-details-button'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.result-dialog-log').textContent.includes('模拟生成日志 100')"), true);
  await assertFits('log-dialog'); await click('.app-dialog footer button');
  failNext = true; await click('.task-flow-actions .primary-button'); await finish(); await assertFits('failure');
  await click('.result-details-button'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.app-dialog').textContent.includes('SEO 生成失败')"), true);
  await click('.app-dialog footer button');
  const longPaths = Array.from({ length: 100 }, (_, i) => `/page-${i}`).join('\n');
  await evaluate(`{ const el = document.querySelector('.seo-paths-textarea'); el.value = ${JSON.stringify(longPaths)}; el.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await evaluate("document.querySelector('.seo-paths-textarea').scrollHeight > document.querySelector('.seo-paths-textarea').clientHeight"), true);
  assert.equal(await evaluate("document.querySelector('.seo-files-page').scrollHeight <= document.querySelector('.seo-files-page').clientHeight + 1"), true);
  win.setSize(1024, 700); await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.seo-files-page').scrollWidth <= document.querySelector('.seo-files-page').clientWidth + 1"), true);
  console.log('SEO layout passed: sizes/fonts/themes, complete paths/menu/footer, output combinations, payloads, busy/results/reveal, logs/errors and long-path/small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
