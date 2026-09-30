// Layout fixtures exercise every real page using ResultPanel without running file conversions.
// Individual tool smoke tests separately cover IPC-driven generation and preview updates.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/result-layout-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
let revealed;
for (const [channel, handler] of Object.entries({
  'config:load': () => null,
  'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8',
  'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'shell:reveal-path': (_event, value) => { revealed = value; }
})) ipcMain.handle(channel, handler);
const router = fs.readFileSync(path.resolve(__dirname, '../src/renderer/router/index.ts'), 'utf8');
const routes = [...router.matchAll(/path: "([^"]+)", component: \(\) => import\("\.\.\/pages\/([^"]+)"\)/g)]
  .filter(match => fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages', match[2]), 'utf8').includes('<ResultPanel'))
  .map(match => match[1]);
const files = Array.from({ length: 13 }, (_, i) => `C:\\fixtures\\很长的输出目录\\${'long-folder-'.repeat(10)}\\生成文件-${i}.png`);
const logs = Array.from({ length: 100 }, (_, i) => `转换日志 ${i + 1}`);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Result layout timed out'); app.exit(1); }, 120_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, frame: false, webPreferences: {
    preload: path.resolve(__dirname, '../dist/electron/preload/index.js'),
    sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(20); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function fixture(result, busy = false) {
    // Test-only component input injection via Vue's mounted vnode tree; no production test hooks.
    await evaluate(`(() => {
      const visit = node => {
        if (!node || typeof node !== 'object') return null;
        if (node.component?.type.__name === 'ResultPanel') return node.component;
        return visit(node.component?.subTree) || visit(node.suspense?.activeBranch) ||
          (Array.isArray(node.children) ? node.children.map(visit).find(Boolean) : null);
      };
      const component = visit(document.querySelector('#app')._vnode);
      if (!component) throw new Error('Missing ResultPanel fixture target');
      component.props.result = ${JSON.stringify(result)};
      component.props.busy = ${busy};
    })()`);
    await pause(80);
  }
  async function fits(label) {
    const problem = await evaluate(`(() => {
      const panel = document.querySelector('.result-panel.paged');
      const p = panel.getBoundingClientRect();
      const selectors = '.section-title, .result-content, .file-list, .file-item, .result-toolbar, .result-toolbar button, .paged-empty, .empty-state';
      return [panel, ...panel.querySelectorAll(selectors)].flatMap(el => {
        const b = el.getBoundingClientRect();
        return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 ||
          b.left < p.left - 1 || b.right > p.right + 1 || b.top < p.top - 1 || b.bottom > p.bottom + 1 ||
          (el.matches('.file-item') && b.height < 26)
          ? [{ class: el.className, w: el.clientWidth, sw: el.scrollWidth, h: el.clientHeight, sh: el.scrollHeight, top: b.top, bottom: b.bottom, panelBottom: p.bottom }] : [];
      });
    })()`);
    if (problem.length) fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(problem, [], label);
    assert.equal(await evaluate("document.querySelector('.result-panel').getBoundingClientRect().bottom <= innerHeight"), true, label);
  }
  assert.ok(routes.length >= 25, 'all shared result tools must be discovered');
  for (const route of routes) {
    win.setSize(1280, 820);
    await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: route });
    await waitFor("!!document.querySelector('.result-panel.paged')");
    await fixture(null, true); await fits(`${route}: busy`);
    await fixture({ status: 'success', files: files.slice(0, 1), logs });
    await fits(`${route}: single file with logs`);
    revealed = undefined;
    await evaluate("document.querySelector('.result-panel .file-item').click()");
    for (let i = 0; !revealed && i < 100; i++) await pause(10);
    assert.equal(revealed, files[0], `${route}: reveal retains the complete path`);
    await fixture({ status: 'partial', files, logs, items: [
      { inputPath: 'C:\\fixtures\\failed.png', status: 'error', errorMessage: '失败项目详情' },
      { inputPath: 'C:\\fixtures\\skipped.png', status: 'skipped' }
    ] });
    for (const [w, h, font, theme] of [[1280, 820, 'system', 'dark'], [1280, 768, 'wdxl-lubrifont', 'light'], [1440, 900, 'system', 'dark']]) {
      win.setSize(w, h);
      await evaluate(`document.documentElement.dataset.uiFont = '${font}'; document.documentElement.dataset.theme = '${theme}'; document.fonts.ready`);
      await pause(80); await fits(`${route}: batch ${w}x${h}`);
    }
    const visited = [];
    for (let i = 0; i < files.length; i++) {
      visited.push(...await evaluate("[...document.querySelectorAll('.result-panel .file-item')].map(el => el.title)"));
      if (!await evaluate("!!document.querySelector('.result-toolbar [title=下一页]:not(:disabled)')")) break;
      await evaluate("document.querySelector('.result-toolbar [title=下一页]').click()");
      await pause(30); await fits(`${route}: pagination`);
    }
    assert.deepEqual(visited, files, `${route}: every file remains reachable exactly once`);
    win.setSize(1280, 768); await pause(80); await fits(`${route}: resize on last page`);
    await evaluate("document.querySelector('.result-details-button').click()");
    await waitFor("!!document.querySelector('.app-dialog[open]')");
    assert.equal(await evaluate("document.querySelector('.app-dialog[open]').textContent.includes('失败项目详情') && document.querySelector('.app-dialog[open] .result-dialog-log').textContent.includes('转换日志 100')"), true, `${route}: log and issue details`);
    await evaluate("document.querySelector('.app-dialog[open] footer button').click()");
    await fixture({ status: 'error', files: [], logs, errorMessage: '测试失败' });
    await fits(`${route}: error with no files`);
    await fixture({ status: 'success', files: files.slice(0, 1), logs });
    assert.equal(await evaluate("document.querySelectorAll('.result-panel .file-item').length"), 1, `${route}: new result resets page`);
    await fits(`${route}: reset`);
    await fixture({ status: 'success', files: files.slice(0, 1), logs }, true);
    await fits(`${route}: running again with previous result`);
    if (route === '/qr-code') fs.writeFileSync(path.join(output, 'qr-result.png'), (await win.webContents.capturePage()).toPNG());
    console.log(`Result layout passed: ${route}`);
  }
  console.log(`All ${routes.length} result tools passed: busy, single/batch/partial/error, desktop sizes/fonts/themes, full file pagination and modal logs.`);
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
