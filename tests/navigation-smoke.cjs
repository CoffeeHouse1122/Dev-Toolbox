// Run after npm run build: npm run test:navigation (also included in npm run check).
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const output = path.resolve(__dirname, "../out/navigation-smoke");
fs.mkdirSync(output, { recursive: true });
// Never load or mutate the real desktop profile during UI checks.
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
const reducedMotion = !process.argv.includes("--motion");
// Exercise both OS animation preferences explicitly instead of inheriting the CI desktop.
app.commandLine.appendSwitch(reducedMotion ? "force-prefers-reduced-motion" : "force-prefers-no-reduced-motion");
let navigation = {
  groups: [
    { id: "seo", tools: [] },
    { id: "system-files", tools: [
      { id: "links", label: "团队资料" }, { id: "shared-disk", label: "共享盘登录" },
      { id: "certificate-scan", visible: false }, { id: "rename" }, { id: "ip-query" }, { id: "uuid" }
    ] },
    { id: "assist", tools: [] }
  ],
  collapsedGroups: { favorites: true, images: true, media: true, font: true, text: true },
  favoriteToolIds: []
};
for (const [channel, handler] of Object.entries({
  "config:load": (_e, key) => key === "navigation" ? navigation : null,
  "config:save": (_e, key, value) => { if (key === "navigation") navigation = value; return value; },
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.6",
  "update:state": () => ({ status: "disabled", activeTasks: 0 })
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("Navigation smoke exceeded 60 seconds"); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, "../dist/electron/preload/index.js"),
    contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const query = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const click = selector => evaluate(`${query(selector)}.click()`);
  async function waitFor(expression) {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const state = await evaluate("JSON.stringify({ hash: location.hash, heading: document.querySelector('.workbench-page h2')?.textContent, visibility: document.visibilityState })");
    throw new Error(`Timed out: ${expression}; state=${state}; rendererErrors=${JSON.stringify(errors)}`);
  }
  const heading = id => `.nav-workbench-link[href='#/workbench/${id}']`;
  const toggle = id => `.nav-group-toggle[aria-controls='nav-group-${id}']`;
  const active = ".nav-workbench-link[aria-current=page]";
  const page = path.resolve(__dirname, "../dist/renderer/index.html");
  if (process.env.NAVIGATION_UI_DEV_URL) await win.loadURL(process.env.NAVIGATION_UI_DEV_URL + "/#/workbench/seo");
  else await win.loadFile(page, { hash: "/workbench/seo" });
  console.log("Navigation smoke: page loaded");
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), reducedMotion);
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === 'SEO 发布工作台'");
  assert.equal(await evaluate("document.querySelectorAll('.workbench-overview-link').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.nav-workbench-link').length"), 7);
  assert.equal(await evaluate("new Set([...document.querySelectorAll('.nav-workbench-link')].map(el => el.getAttribute('aria-label'))).size"), 7);
  assert.equal(await evaluate(`document.querySelectorAll('${active}').length`), 1);
  assert.equal(await evaluate("[...document.querySelectorAll('.nav-workbench-link')].every(el => el.textContent.trim() === '' && el.children.length === 1 && el.querySelector('i.ri-dashboard-line[aria-hidden=true]'))"), true);
  assert.equal(await evaluate(`${query(heading("system"))}.title`), "文件与网络总览");
  assert.equal(await evaluate("[...document.querySelectorAll('.nav-workbench-link')].every(el => el.title === el.getAttribute('aria-label') && el.title.endsWith('总览'))"), true);
  for (const id of ["favorites", "system"]) {
    assert.equal(await evaluate(`${query(toggle(id))}.parentElement.querySelector('.nav-workbench-link') === null`), true);
    const before = await evaluate(`${query(toggle(id))}.getAttribute('aria-expanded')`);
    await click(toggle(id));
    assert.notEqual(await evaluate(`${query(toggle(id))}.getAttribute('aria-expanded')`), before);
    assert.equal(await evaluate("location.hash"), "#/workbench/seo");
    await click(toggle(id));
  }

  // Collapsing must not navigate. The overview remains reachable while collapsed.
  await click(toggle("system-files") + " .nav-workbench-label");
  assert.equal(await evaluate("location.hash"), "#/workbench/seo");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "false");
  await click(heading("system"));
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === '文件与网络工作台'");
  console.log("Navigation smoke: category navigation passed");
  assert.equal(await evaluate(`${query(active)}.getAttribute('href')`), "#/workbench/system");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "false");
  // The count belongs to the same collapse target; overview navigation never collapses tools.
  await click(toggle("system-files") + " .nav-group-count");
  assert.equal(await evaluate("location.hash"), "#/workbench/system");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "true");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.workbench-tool-card')].map(el => [el.getAttribute('href'), el.querySelector('strong').textContent])"),
    await evaluate("[...document.querySelectorAll('#nav-group-system-files .nav-item')].map(el => [el.getAttribute('href'), el.querySelector('span').textContent])"));
  assert.equal(await evaluate("document.querySelector('.workbench-header .status-pill').textContent.trim()"),
    (await evaluate(`${query(toggle("system-files") + " .nav-group-count")}.textContent.trim()`)) + " 项工具");
  assert.equal(await evaluate("[...document.querySelectorAll('.workbench-tool-card strong')].some(el => el.textContent === '共享连接')"), true);
  assert.equal(await evaluate("!!document.querySelector('.workbench-tool-card[href=\"#/certificate-scan\"]')"), false);
  assert.equal(await evaluate("!!document.querySelector('.workbench-tool-card[href=\"#/uuid\"]')"), true);
  assert.equal(await evaluate("!!document.querySelector('#nav-group-assist .nav-item[href=\"#/uuid\"]')"), false);

  // Tool routes have no active overview. Pinning still updates the favorites group.
  await click("#nav-group-system-files .nav-item-pin");
  await waitFor("document.querySelector('#nav-group-favorites').textContent.includes('团队资料')");
  await click("#nav-group-assist .nav-item[href='#/timestamp']");
  await waitFor("location.hash === '#/timestamp'");
  assert.equal(await evaluate(`document.querySelectorAll('${active}').length`), 0);
  await click(toggle("assist") + " .nav-workbench-label");
  assert.equal(await evaluate("location.hash"), "#/timestamp", "collapsing the current category must keep the active tool");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "true", "other categories stay expanded");
  await click(toggle("assist") + " .nav-group-count");
  await evaluate(`${query(heading("seo"))}.focus()`);
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === 'SEO 发布工作台'");
  console.log("Navigation smoke: keyboard navigation passed");
  await waitFor("document.querySelector('.workbench-page')?.getBoundingClientRect().height > 100");
  await new Promise(resolve => setTimeout(resolve, 400));
  await evaluate("document.fonts.ready");
  for (const theme of ["dark", "light"]) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    const surface = theme === "dark" ? "rgb(22, 27, 34)" : "rgb(255, 255, 255)";
    await waitFor(`getComputedStyle(document.querySelector('.workbench-tool-card')).backgroundColor === '${surface}'`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const headerPositions = await evaluate("[...document.querySelectorAll('.nav-group-toggle')].map(el => ({ group: el.getAttribute('aria-controls'), positions: ['.nav-group-chevron', '.nav-workbench-label', '.nav-group-count'].map(selector => el.querySelector(selector).getBoundingClientRect().x) }))");
    assert.equal(headerPositions.every(item => item.positions.every((x, index) => Math.abs(x - headerPositions[0].positions[index]) < 1)), true, `all category headers including favorites and system align: ${JSON.stringify(headerPositions)}`);
    assert.equal(await evaluate("[...document.querySelectorAll('.nav-workbench-link')].every(el => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el); const icon = getComputedStyle(el.firstElementChild, '::before'); return box.width === 32 && box.height === 32 && style.borderTopWidth === '0px' && style.fontSize === '16px' && icon.content !== 'none' && icon.content !== ''; })"), true);
    fs.writeFileSync(path.join(output, `${theme}.png`), (await win.webContents.capturePage()).toPNG());
    assert.equal(await evaluate("[...document.querySelectorAll('.nav-workbench-link')].every(el => el.getBoundingClientRect().right <= document.querySelector('.sidebar').getBoundingClientRect().right)"), true);
  }
  assert.deepEqual(errors, []);
  assert.ok(navigation.favoriteToolIds.includes("links"));
  // Persistence includes customized labels, moved tools, hidden tools and collapse state.
  await win.webContents.reload();
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === 'SEO 发布工作台'");
  await waitFor("document.querySelector('#nav-group-favorites').textContent.includes('团队资料')");
  await click(heading("system"));
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === '文件与网络工作台'");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "true");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.workbench-tool-card')].map(el => el.querySelector('strong').textContent)"),
    await evaluate("[...document.querySelectorAll('#nav-group-system-files .nav-item span')].map(el => el.textContent)"));
  await evaluate("document.querySelectorAll('.nav-group-toggle[aria-expanded=true]').forEach(el => el.click())");
  await new Promise(resolve => setTimeout(resolve, 300));
  fs.writeFileSync(path.join(output, "collapsed.png"), (await win.webContents.capturePage()).toPNG());
  console.log(`Navigation UI passed (${reducedMotion ? "reduced" : "normal"} motion): unique category entries, separate expand/navigation, exact active state, keyboard activation, pinning and both themes.`);
  win.destroy();
  clearTimeout(watchdog);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
