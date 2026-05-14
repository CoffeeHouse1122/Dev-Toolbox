<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CaptureProxyRecord, CaptureProxyStatus } from "../../shared/types";

type HostMode = "local" | "lan";
type MethodFilter = "all" | "http" | "connect" | "error";
type CaptureProxyConfig = {
  hostMode: HostMode;
  listenHost: string;
  port: number;
  captureBodies: boolean;
  enableHttps: boolean;
  maxBodyKb: number;
};

const hostMode = ref<HostMode>("local");
const listenHost = ref("0.0.0.0");
const port = ref(8899);
const captureBodies = ref(true);
const enableHttps = ref(true);
const maxBodyKb = ref(512);
const status = ref<CaptureProxyStatus>({ running: false, host: "127.0.0.1", port: 8899, startedAt: null, recordCount: 0 });
const records = ref<CaptureProxyRecord[]>([]);
const selectedId = ref("");
const query = ref("");
const methodFilter = ref<MethodFilter>("all");
const busy = ref(false);
const copied = ref(false);
const selfTesting = ref(false);
const selfTestMessage = ref("");
const errorMessage = ref("");
const guideOpen = ref(false);
const captureConfigLoaded = ref(false);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const proxyHost = computed(() => (hostMode.value === "local" ? "127.0.0.1" : listenHost.value.trim() || "0.0.0.0"));
const selectedRecord = computed(() => records.value.find((record) => record.id === selectedId.value) ?? records.value[0] ?? null);
const proxyAddress = computed(() => `${status.value.host === "0.0.0.0" ? "本机局域网 IP" : status.value.host}:${status.value.port}`);
const activeSince = computed(() => (status.value.startedAt ? formatTime(status.value.startedAt) : "未启动"));
const portHelpText = "这里是代理端口，目标服务端口写在请求 URL 中。";

const summary = computed(() => {
  const total = records.value.length;
  const errors = records.value.filter((record) => record.status === "error").length;
  const tunnels = records.value.filter((record) => record.method === "CONNECT").length;
  return { total, errors, tunnels, http: total - tunnels };
});

const filteredRecords = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return records.value.filter((record) => {
    const methodMatched =
      methodFilter.value === "all" ||
      (methodFilter.value === "http" && record.method !== "CONNECT") ||
      (methodFilter.value === "connect" && record.method === "CONNECT") ||
      (methodFilter.value === "error" && record.status === "error");
    const keywordMatched = !keyword || `${record.method} ${record.url} ${record.statusCode ?? ""}`.toLowerCase().includes(keyword);
    return methodMatched && keywordMatched;
  });
});

const methodOptions: Array<{ value: MethodFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "http", label: "HTTP" },
  { value: "connect", label: "CONNECT" },
  { value: "error", label: "错误" }
];

function formatTime(value: number) {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function statusLabel(record: CaptureProxyRecord) {
  if (record.status === "tunnel") return "隧道";
  if (record.status === "error") return "错误";
  return record.statusCode ?? "等待";
}

function headerEntries(headers: Record<string, string>) {
  return Object.entries(headers || {});
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

async function loadCaptureConfig() {
  try {
    const saved = await window.devToolbox.loadToolConfig("capture-proxy") as Partial<CaptureProxyConfig> | null;
    if (!saved) return;
    if (saved.hostMode === "local" || saved.hostMode === "lan") hostMode.value = saved.hostMode;
    if (typeof saved.listenHost === "string") listenHost.value = saved.listenHost;
    port.value = sanitizeNumber(saved.port, port.value, 1024, 65535);
    maxBodyKb.value = sanitizeNumber(saved.maxBodyKb, maxBodyKb.value, 1, 2048);
    if (typeof saved.captureBodies === "boolean") captureBodies.value = saved.captureBodies;
    if (typeof saved.enableHttps === "boolean") enableHttps.value = saved.enableHttps;
  } finally {
    captureConfigLoaded.value = true;
  }
}

function saveCaptureConfig() {
  if (!captureConfigLoaded.value) return;
  void window.devToolbox.saveToolConfig("capture-proxy", {
    hostMode: hostMode.value,
    listenHost: listenHost.value,
    port: port.value,
    captureBodies: captureBodies.value,
    enableHttps: enableHttps.value,
    maxBodyKb: maxBodyKb.value
  } satisfies CaptureProxyConfig);
}

async function refresh() {
  status.value = await window.devToolbox.getCaptureProxyStatus();
  records.value = await window.devToolbox.listCaptureProxyRecords();
  if (selectedId.value && !records.value.some((record) => record.id === selectedId.value)) selectedId.value = "";
}

async function startProxy() {
  busy.value = true;
  errorMessage.value = "";
  try {
    status.value = await window.devToolbox.startCaptureProxy({
      host: proxyHost.value,
      port: port.value,
      captureBodies: captureBodies.value,
      maxBodySize: maxBodyKb.value * 1024,
      enableHttps: enableHttps.value
    });
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

async function stopProxy() {
  busy.value = true;
  try {
    status.value = await window.devToolbox.stopCaptureProxy();
    await refresh();
  } finally {
    busy.value = false;
  }
}

async function clearRecords() {
  records.value = await window.devToolbox.clearCaptureProxyRecords();
  selectedId.value = "";
  await refresh();
}

async function copyProxyAddress() {
  await navigator.clipboard.writeText(proxyAddress.value);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1200);
}

async function runSelfTest() {
  if (!status.value.running) return;
  selfTesting.value = true;
  selfTestMessage.value = "";
  errorMessage.value = "";
  try {
    const record = await window.devToolbox.testCaptureProxy();
    selfTestMessage.value = `自检成功：${record.statusCode ?? "-"}`;
    selectedId.value = record.id;
    await refresh();
  } catch (error) {
    selfTestMessage.value = "";
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    selfTesting.value = false;
  }
}

function openCaCertificate() {
  if (!status.value.caCertPath) return;
  void window.devToolbox.revealPath(status.value.caCertPath);
}

onMounted(async () => {
  await loadCaptureConfig();
  await refresh();
  refreshTimer = setInterval(() => {
    void refresh();
  }, 1200);
});

watch([hostMode, listenHost, port, captureBodies, enableHttps, maxBodyKb], saveCaptureConfig);

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <section class="tool-page capture-tool">
    <div class="tool-header">
      <div>
        <h2>抓包工具</h2>
        <p>HTTP 明文请求与 HTTPS 隧道记录</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" @click="guideOpen = true">
          <i class="ri-question-line" aria-hidden="true"></i>
          代理使用指引
        </button>
        <button v-if="!status.running" type="button" class="primary-button" :disabled="busy" @click="startProxy">
          <i class="ri-play-fill" aria-hidden="true"></i>
          启动代理
        </button>
        <button v-else type="button" class="primary-button danger-button" :disabled="busy" @click="stopProxy">
          <i class="ri-stop-fill" aria-hidden="true"></i>
          停止代理
        </button>
      </div>
    </div>

    <div class="capture-layout">
      <section class="tool-main capture-config-panel">
        <div class="capture-config-head">
          <div class="section-title">
            <h2>代理配置</h2>
            <span class="status-pill" :class="{ running: status.running }">{{ status.running ? "RUNNING" : "STOPPED" }}</span>
          </div>

        </div>

        <div class="capture-config-grid">
          <div class="capture-mode-grid">
            <button type="button" class="secondary-button" :class="{ selected: hostMode === 'local' }" :disabled="status.running" @click="hostMode = 'local'">
              <i class="ri-computer-line" aria-hidden="true"></i>
              本机
            </button>
            <button type="button" class="secondary-button" :class="{ selected: hostMode === 'lan' }" :disabled="status.running" @click="hostMode = 'lan'">
              <i class="ri-wifi-line" aria-hidden="true"></i>
              局域网
            </button>
          </div>
          <label class="field">
            <span>监听 IP</span>
            <input v-model="listenHost" :disabled="status.running || hostMode === 'local'" placeholder="0.0.0.0 或本机局域网 IP" />
          </label>
          <label class="field">
            <span>代理端口</span>
            <input v-model.number="port" type="number" min="1024" max="65535" :disabled="status.running" :title="portHelpText" />
          </label>
          <label class="field">
            <span>正文上限 KB</span>
            <input v-model.number="maxBodyKb" type="number" min="1" max="2048" :disabled="status.running || !captureBodies" />
          </label>
          <label class="check-row capture-body-check">
            <input v-model="captureBodies" type="checkbox" :disabled="status.running" />
            <span>记录 HTTP 请求 / 响应正文</span>
          </label>
          <label class="check-row capture-body-check">
            <input v-model="enableHttps" type="checkbox" :disabled="status.running" />
            <span>HTTPS 解密</span>
          </label>
        </div>

        <div class="capture-ca-row">
          <span>HTTPS CA</span>
          <code>{{ status.caCertPath }}</code>
          <button type="button" class="secondary-button" :disabled="!status.caCertPath" @click="openCaCertificate">
            <i class="ri-folder-open-line" aria-hidden="true"></i>
            打开位置
          </button>
        </div>

        <div class="capture-stats">
          <div class="proxy-address-card" :title="proxyAddress">
            <span>代理地址</span>
            <strong>{{ proxyAddress }}</strong>
            <button type="button" class="secondary-button" @click="copyProxyAddress">
              <i :class="copied ? 'ri-check-line' : 'ri-file-copy-line'" aria-hidden="true"></i>
              {{ copied ? "已复制" : "复制" }}
            </button>
            <button type="button" class="secondary-button" :disabled="!status.running || selfTesting" @click="runSelfTest">
              <i class="ri-pulse-line" aria-hidden="true"></i>
              {{ selfTesting ? "自检中" : "自检" }}
            </button>
          </div>
          <div><span>启动时间</span><strong>{{ activeSince }}</strong></div>
          <div><span>HTTP</span><strong>{{ summary.http }}</strong></div>
          <div><span>CONNECT</span><strong>{{ summary.tunnels }}</strong></div>
          <div><span>错误</span><strong>{{ summary.errors }}</strong></div>
        </div>
        <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
        <p v-else-if="selfTestMessage" class="capture-inline-status">{{ selfTestMessage }}</p>
      </section>

      <div class="capture-workspace">
        <section class="tool-main capture-main">
          <div class="capture-toolbar">
            <input v-model="query" class="capture-search" placeholder="过滤 URL / 方法 / 状态码" />
            <div class="capture-filter-group">
              <button
                v-for="item in methodOptions"
                :key="item.value"
                type="button"
                class="toggle-chip"
                :class="{ selected: methodFilter === item.value }"
                @click="methodFilter = item.value"
              >{{ item.label }}</button>
            </div>
            <button type="button" class="secondary-button" :disabled="!records.length" @click="clearRecords">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
              清空
            </button>
          </div>

          <div class="capture-table">
            <button
              v-for="record in filteredRecords"
              :key="record.id"
              type="button"
              class="capture-row"
              :class="{ selected: selectedRecord?.id === record.id, error: record.status === 'error' }"
              @click="selectedId = record.id"
            >
              <span class="capture-method">{{ record.method }}</span>
              <span class="capture-status">{{ statusLabel(record) }}</span>
              <span class="capture-url" :title="record.url">{{ record.url }}</span>
              <span class="capture-time">{{ record.durationMs ?? "-" }}ms</span>
            </button>
            <p v-if="!filteredRecords.length" class="empty-state capture-empty-tip">
              暂无请求。请确认发起请求的浏览器、系统或客户端代理已设置为 {{ proxyAddress }}；也可以点击“自检”确认代理是否可用。
            </p>
          </div>
        </section>

        <aside class="result-panel capture-detail">
          <template v-if="selectedRecord">
            <div class="section-title">
              <h2>详情</h2>
              <span class="status-pill">{{ selectedRecord.protocol.toUpperCase() }}</span>
            </div>
            <div class="capture-detail-url" :title="selectedRecord.url">{{ selectedRecord.url }}</div>

            <section class="capture-detail-section">
              <h3>概览</h3>
              <div class="capture-meta-grid">
                <div><span>方法</span><strong>{{ selectedRecord.method }}</strong></div>
                <div><span>状态</span><strong>{{ statusLabel(selectedRecord) }}</strong></div>
                <div><span>耗时</span><strong>{{ selectedRecord.durationMs ?? "-" }}ms</strong></div>
                <div><span>大小</span><strong>{{ formatSize(selectedRecord.requestSize) }} / {{ formatSize(selectedRecord.responseSize) }}</strong></div>
              </div>
            </section>

            <section class="capture-detail-section">
              <h3>正文</h3>
              <pre v-if="selectedRecord.requestBody"><strong>Request</strong>{{ selectedRecord.requestBody }}</pre>
              <pre v-if="selectedRecord.responseBody"><strong>Response</strong>{{ selectedRecord.responseBody }}</pre>
              <p v-if="!selectedRecord.requestBody && !selectedRecord.responseBody" class="empty-state">当前请求没有可展示正文，或为 HTTPS 隧道/二进制内容。</p>
            </section>

            <section class="capture-detail-section">
              <h3>请求头</h3>
              <div class="header-list">
                <div v-for="[key, value] in headerEntries(selectedRecord.requestHeaders)" :key="`req-${key}`"><span>{{ key }}</span><code>{{ value }}</code></div>
              </div>
            </section>

            <section class="capture-detail-section">
              <h3>响应头</h3>
              <div class="header-list">
                <div v-for="[key, value] in headerEntries(selectedRecord.responseHeaders)" :key="`res-${key}`"><span>{{ key }}</span><code>{{ value }}</code></div>
              </div>
            </section>

            <p v-if="selectedRecord.errorMessage" class="error-banner">{{ selectedRecord.errorMessage }}</p>
          </template>
          <p v-else class="empty-state">选择一条请求查看详情。</p>
        </aside>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="guideOpen" class="capture-guide-mask" @click.self="guideOpen = false">
        <aside class="capture-guide-drawer" role="dialog" aria-modal="true" aria-labelledby="capture-guide-title">
          <header class="capture-guide-head">
            <div>
              <h3 id="capture-guide-title">代理使用指引</h3>
              <p>抓包代理只负责接收已经指向它的流量，浏览器、系统或客户端需要单独设置代理。</p>
            </div>
            <button type="button" class="secondary-button icon-only" aria-label="关闭" @click="guideOpen = false">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </header>

          <div class="capture-guide-body">
            <section class="capture-guide-section">
              <h4>最快路径</h4>
              <ol>
                <li>启动代理，复制当前代理地址。</li>
                <li>把浏览器、系统代理或测试客户端的 HTTP / HTTPS 代理设置为该地址。</li>
                <li>发起目标请求后回到列表查看记录；列表为空时先点“自检”。</li>
              </ol>
            </section>

            <section class="capture-guide-section">
              <h4>HTTPS 全流程</h4>
              <ol>
                <li>勾选“HTTPS 解密”并启动代理。</li>
                <li>点击“打开位置”，找到本地 CA 证书文件。</li>
                <li>Windows / Chrome / Edge：把 CA 导入“受信任的根证书颁发机构”。Firefox 需要在浏览器证书管理器中单独导入。</li>
                <li>把客户端代理设置为当前代理地址，必要时重启浏览器或目标客户端。</li>
                <li>访问 HTTPS 目标。如果列表只出现 CONNECT，通常是 CA 未信任、客户端未走代理，或目标应用启用了证书固定。</li>
              </ol>
            </section>

            <section class="capture-guide-section">
              <h4>更简单的抓法</h4>
              <ul>
                <li>只看浏览器请求时，Chrome / Edge DevTools 的 Network 面板最省事，但它不能抓其它应用。</li>
                <li>想少改系统设置，可以用浏览器代理插件切换到 {{ proxyAddress }}。</li>
                <li>命令行验证可使用 <code>curl -x http://{{ proxyAddress }} https://example.com</code>。</li>
                <li>本工具当前保留手动代理方式，避免一键改系统代理后忘记恢复。</li>
              </ul>
            </section>
          </div>
        </aside>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.capture-tool {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: calc(100vh - 108px);
  min-height: 520px;
  overflow: hidden;
}

.capture-layout,
.capture-config-panel,
.capture-main,
.capture-detail,
.capture-detail-section {
  display: grid;
  gap: 14px;
}

.capture-layout {
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.capture-config-panel {
  gap: 10px;
  padding: 12px;
  overflow: visible;
}

.capture-config-head {
  display: grid;
  grid-template-columns: minmax(150px, auto) minmax(280px, 1fr);
  gap: 10px;
  align-items: center;
}

.capture-config-grid {
  display: grid;
  grid-template-columns: 200px minmax(150px, 1fr) 102px 102px 170px 90px;
  gap: 8px;
  align-items: end;
  min-width: 0;
}

.capture-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.capture-mode-grid .secondary-button {
  justify-content: center;
  min-height: 30px;
  padding: 4px 8px;
  gap: 5px;
  white-space: nowrap;
  word-break: keep-all;
  font-size: 12px;
}

.capture-config-grid .field {
  gap: 4px;
}

.capture-config-grid input {
  min-height: 30px;
  padding: 4px 8px;
}

.secondary-button.selected {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.capture-body-check {
  min-height: 30px;
  align-self: end;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
  word-break: keep-all;
}

.capture-body-check input[type="checkbox"] {
  width: 14px;
  min-height: 14px;
  margin: 0;
  accent-color: var(--accent);
  outline: none;
  box-shadow: none;
}

.capture-body-check input[type="checkbox"]:focus,
.capture-body-check input[type="checkbox"]:focus-visible {
  outline: none;
  box-shadow: none;
}

.capture-ca-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
  min-height: 32px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.capture-ca-row span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.capture-ca-row code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}

.proxy-address-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 4px 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.proxy-address-card span {
  grid-column: 1 / -1;
}

.proxy-address-card .secondary-button {
  min-height: 30px;
  padding: 4px 9px;
  font-size: 12px;
  white-space: nowrap;
}

.proxy-address-card span,
.capture-stats span,
.capture-meta-grid span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.proxy-address-card strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.capture-stats {
  display: grid;
  grid-template-columns: 300px repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.capture-stats div,
.capture-meta-grid div {
  display: grid;
  gap: 2px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.capture-inline-status {
  margin: 0;
  color: var(--success);
  font-size: 12px;
  font-weight: 700;
}

.capture-empty-tip {
  padding: 14px;
  line-height: 1.6;
}

.capture-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 12px;
  align-items: start;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.capture-main,
.capture-detail {
  height: 100%;
  min-height: 0;
}

.capture-main {
  grid-template-rows: auto minmax(0, 1fr);
}

.capture-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.capture-search {
  width: 100%;
}

.capture-filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.capture-table {
  display: grid;
  align-content: start;
  min-height: 0;
  max-height: none;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.capture-row {
  display: grid;
  grid-template-columns: 70px 58px minmax(0, 1fr) 58px;
  gap: 8px;
  align-items: start;
  min-width: 0;
  padding: 9px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.capture-row:hover,
.capture-row.selected {
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}

.capture-row.error {
  background: color-mix(in srgb, var(--danger) 5%, var(--surface));
}

.capture-method,
.capture-status {
  display: inline-grid;
  place-items: center;
  min-height: 24px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.capture-url,
.capture-time {
  font-size: 12px;
}

.capture-url {
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.capture-time {
  color: var(--muted);
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.capture-detail {
  max-height: none;
  overflow: auto;
}

.capture-detail-url {
  overflow-wrap: anywhere;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.capture-detail-section h3 {
  margin: 0;
  font-size: 13px;
}

.capture-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.header-list {
  display: grid;
  gap: 6px;
}

.header-list div {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
}

.header-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.header-list code,
.capture-detail-section pre {
  min-width: 0;
  margin: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.capture-detail-section pre {
  max-height: 260px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.capture-detail-section pre strong {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
}

.danger-button:hover:not(:disabled) {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 82%, var(--surface));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 12%, transparent);
}

.capture-guide-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, #0d1117 45%, transparent);
  -webkit-app-region: no-drag;
}

.capture-guide-drawer {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(520px, 100vw);
  height: 100vh;
  border-left: 1px solid var(--border);
  background: var(--surface);
  box-shadow: -18px 0 48px rgba(1, 4, 9, 0.34);
  animation: capture-guide-in 0.16s ease-out;
  -webkit-app-region: no-drag;
}

.capture-guide-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-subtle);
}

.capture-guide-head h3,
.capture-guide-section h4 {
  margin: 0;
}

.capture-guide-head p {
  margin: 6px 0 0;
  color: var(--muted);
  line-height: 1.55;
}

.capture-guide-body {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 18px;
  overflow: auto;
}

.capture-guide-section {
  display: grid;
  gap: 10px;
}

.capture-guide-section ol,
.capture-guide-section ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 20px;
  color: var(--text);
  line-height: 1.6;
}

.capture-guide-section code {
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--surface-subtle);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

@keyframes capture-guide-in {
  from { transform: translateX(18px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (max-width: 1280px) {
  .capture-config-head {
    grid-template-columns: minmax(140px, auto) minmax(260px, 1fr);
  }

  .capture-config-grid {
    grid-template-columns: 200px minmax(200px, 1fr) 84px 84px 165px 90px;
  }
}

@media (max-width: 920px) {
  .capture-config-head,
  .capture-config-grid,
  .capture-ca-row {
    grid-template-columns: 1fr;
  }
}
</style>