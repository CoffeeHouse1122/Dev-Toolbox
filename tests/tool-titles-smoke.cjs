const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/tool-titles-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/navigation.ts'), 'utf8');
const tools = [...source.matchAll(/id: "([^"]+)", to: "([^"]+)", label: "([^"]+)"/g)].map(([, id, route, label]) => ({ id, route, label }));
let navigation = { groups: [], collapsedGroups: {}, favoriteToolIds: ['favicon'] };
const records = ['favicon', 'batch-rename', 'markdown-export', 'data-convert', 'hash', 'sprite', 'unknown-legacy'].map((toolType, index) => ({
  id: String(index), toolType, status: 'success', sourcePath: '', outputPath: '', optionsJson: '{}',
  createdAt: '2026-09-30T00:00:00Z', finishedAt: '2026-09-30T00:00:00Z'
}));
for (const [channel, handler] of Object.entries({
  'config:load': (_event, key) => key === 'navigation' ? navigation : null,
  'config:save': (_event, key, value) => { if (key === 'navigation') navigation = value; return value; },
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'settings:load': () => ({ closeBehavior: 'minimize-to-tray', autoLaunch: false }),
  'diagnostics:get': () => ({ userDataDir: output, logsDir: output, ports: [] }),
  'output-authorizations:state': () => ({ count: 0, available: true }),
  'shared-disk:load': () => ({ sharePath: '', defaultDirectory: '', authMode: 'current', username: '', rememberCredentials: false, hasPassword: false }),
  'network:ip-info': () => ({ internal: [], externalIp: '' }),
  'clipboard:start': () => ({ watching: false }), 'clipboard:list': () => [],
  'notes:load': () => ({ directory: '', notes: [], archivedNotes: [], trashNotes: [], preferences: { fontSize: 16, color: '#1f2328', backgroundColor: '#ffffff' } }),
  'history:list': () => records
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Tool title smoke timed out'); app.exit(1); }, 90_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, frame: false, webPreferences: {
    preload: path.resolve(__dirname, '../dist/electron/preload/index.js'), sandbox: true,
    contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(20); }
    throw new Error(`Timed out: ${expression}; errors: ${errors.join('\n')}`);
  }
  async function navigate(route, selector) {
    await evaluate(`location.hash = ${JSON.stringify(route)}`);
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/favicon' });
  assert.equal(tools.length, 49);
  for (const tool of tools) {
    await navigate(tool.route, `h2[data-tool-id="${tool.id}"]`);
    await waitFor(`document.querySelector('h2[data-tool-id="${tool.id}"]').textContent === ${JSON.stringify(tool.label)}`);
    const labels = await evaluate(`[...document.querySelectorAll('.nav-item[href="#${tool.route}"] span')].map(el => el.textContent)`);
    assert.ok(labels.length >= 1 && labels.every(label => label === tool.label), `${tool.id}: page, sidebar and favorites agree`);
  }
  for (const id of ['images', 'media', 'font', 'text', 'seo', 'system', 'assist']) {
    await navigate(`/workbench/${id}`, '.workbench-page');
    await pause(50);
    const cards = await evaluate("[...document.querySelectorAll('.workbench-tool-card')].map(el => ({ route: el.getAttribute('href').slice(1), label: el.querySelector('strong').textContent }))");
    assert.ok(cards.length > 0);
    for (const card of cards) assert.equal(card.label, tools.find(tool => tool.route === card.route)?.label);
  }
  await navigate('/history', 'h2[data-tool-id="history"]');
  await waitFor("document.querySelectorAll('.history-row:not(.history-head)').length >= 7");
  const historyLabels = () => evaluate("[...document.querySelectorAll('button.history-row > span:first-child')].map(el => el.textContent)");
  assert.deepEqual(await historyLabels(), ['图标生成', '文件重命名', 'Markdown', 'JSON/YAML/TOML', 'Hash 生成', '雪碧图', 'unknown-legacy']);

  // Change names through the real navigation editor; cached pages must update too.
  await navigate('/settings', 'h2[data-tool-id="settings"]');
  await evaluate("[...document.querySelectorAll('.settings-block button')].find(el => el.textContent.includes('编辑导航')).click()");
  await waitFor("!!document.querySelector('.nav-editor-modal')");
  await evaluate(`(() => {
    for (const [before, after] of [['图标生成', '品牌图标'], ['设置', '应用设置']]) {
      const input = [...document.querySelectorAll('.tool-input')].find(el => el.value === before);
      input.value = after; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('.nav-editor-modal .dt-modal-foot .primary-button').click();
  })()`);
  await waitFor("document.querySelector('h2[data-tool-id=settings]').textContent === '应用设置'");
  await navigate('/favicon', 'h2[data-tool-id="favicon"]');
  assert.equal(await evaluate("document.querySelector('h2[data-tool-id=favicon]').textContent"), '品牌图标');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.nav-item[href=\"#/favicon\"] span')].map(el => el.textContent)"), ['品牌图标', '品牌图标']);
  await navigate('/workbench/images', '.workbench-page');
  await waitFor("document.querySelector('.workbench-tool-card[href=\"#/favicon\"] strong')?.textContent === '品牌图标'");
  await navigate('/history', 'h2[data-tool-id="history"]');
  assert.equal((await historyLabels())[0], '品牌图标');
  await navigate('/favicon', 'h2[data-tool-id="favicon"]');
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/favicon' });
  await waitFor("document.querySelector('h2[data-tool-id=favicon]')?.textContent === '品牌图标'");
  await evaluate("document.fonts.ready"); await pause(100);
  fs.writeFileSync(path.join(output, 'unified-title.png'), (await win.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, [], 'no renderer errors');
  console.log('Tool titles passed: all 49 pages, seven overviews, favorites, history aliases/unknown tools, live custom names, cached pages and reload persistence.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
