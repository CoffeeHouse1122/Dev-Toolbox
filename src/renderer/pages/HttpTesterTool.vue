<script setup lang="ts">
import { ref, computed } from "vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const method = ref("GET");
const url = ref("");
const headersText = ref("");
const bodyText = ref("");
const timeoutSecs = ref(10);
const headerPreset = ref("");
const multipartFieldsText = ref("name=dev-toolbox\nrole=frontend");

const busy = ref(false);
const statusCode = ref<number | null>(null);
const statusText = ref("");
const responseHeaders = ref<Record<string, string>>({});
const responseBody = ref("");
const responseTimeMs = ref(0);
const errorMessage = ref("");
const responseBodyEncoding = ref<"text" | "base64">("text");
const responseTruncated = ref(false);
const hasResponse = computed(() => statusCode.value !== null || Boolean(errorMessage.value));
const responseHeaderCount = computed(() => Object.keys(responseHeaders.value).length);

// 常用 Content-Type 快捷预设
const presetHeaders: Record<string, string> = {
  "application/json": "Content-Type: application/json\nAccept: application/json",
  "application/x-www-form-urlencoded": "Content-Type: application/x-www-form-urlencoded",
  "multipart/form-data": "Accept: application/json",
  "text/plain": "Content-Type: text/plain",
  "application/xml": "Content-Type: application/xml\nAccept: application/xml",
};

const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((value) => ({ label: value, value }));
const headerPresetOptions = computed(() => [
  { label: "手动输入", value: "" },
  ...Object.keys(presetHeaders).map((value) => ({ label: value, value }))
]);
const usesMultipart = computed(() => headerPreset.value === "multipart/form-data" && method.value !== "GET" && method.value !== "HEAD");

function setPresetHeaders(type: string) {
  headerPreset.value = type;
  headersText.value = presetHeaders[type] || "";
}

function parseHeaders(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  raw.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const idx = line.indexOf(":");
    if (idx <= 0) throw new Error(`请求头第 ${index + 1} 行格式无效，请使用 Header: value`);
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim();
    if (key) result[key] = val;
  });
  return result;
}

function parseMultipartFields(raw: string) {
  const fields = raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`multipart 第 ${index + 1} 行格式无效，请使用 name=value`);
    return { name: line.slice(0, separator).trim(), value: line.slice(separator + 1) };
  });
  if (!fields.length) throw new Error("multipart 请求至少需要一个 name=value 字段");
  return fields;
}

async function sendRequest() {
  if (!url.value) return;
  busy.value = true;
  statusCode.value = null;
  statusText.value = "";
  responseHeaders.value = {};
  responseBody.value = "";
  responseTimeMs.value = 0;
  errorMessage.value = "";
  responseBodyEncoding.value = "text";
  responseTruncated.value = false;

  const startTime = performance.now();
  try {
    const headers = parseHeaders(headersText.value);
    const hasBody = method.value !== "GET" && method.value !== "HEAD";
    const isMultipart = usesMultipart.value;
    if (isMultipart) {
      Object.keys(headers).forEach((key) => {
        if (key.toLowerCase() === "content-type") delete headers[key];
      });
    }
    timeoutSecs.value = Math.min(60, Math.max(1, Number(timeoutSecs.value) || 10));
    const response = await window.devToolbox.sendHttpRequest({
      url: url.value.trim(),
      method: method.value,
      headers,
      body: hasBody && !isMultipart && bodyText.value ? bodyText.value : undefined,
      multipartFields: isMultipart ? parseMultipartFields(multipartFieldsText.value) : undefined,
      timeoutMs: timeoutSecs.value * 1000
    });

    statusCode.value = response.status;
    statusText.value = response.statusText;
    responseTimeMs.value = response.elapsedMs || Math.round(performance.now() - startTime);
    responseHeaders.value = response.headers;
    responseBodyEncoding.value = response.bodyEncoding;
    responseTruncated.value = response.truncated;
    if (response.bodyEncoding === "text" && (response.headers["content-type"] ?? "").includes("application/json")) {
      try {
        responseBody.value = JSON.stringify(JSON.parse(response.body), null, 2);
      } catch {
        responseBody.value = response.body;
      }
    } else {
      responseBody.value = response.body;
    }
  } catch (err: any) {
    errorMessage.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="快速 HTTP 请求"
    description="用于 JSON、Bearer Token 与临时接口请求的轻量工具，不作为完整 API 客户端"
    source-title="请求目标"
    source-description="选择方法并填写接口地址与超时时间"
    settings-title="请求配置"
    settings-description="设置请求头以及原始请求体或 multipart 字段"
    preview-title="响应结果"
    preview-description="集中查看状态、耗时、响应头与响应正文"
    :file-label="busy ? '请求中' : method"
    variant="preview-dominant"
  >
    <template #source>
      <div class="http-request-bar">
        <SelectMenu v-model="method" class="http-method-select" :options="methodOptions" />
        <input v-model="url" class="http-url-input" placeholder="https://api.example.com/endpoint" />
        <div class="http-timeout-group">
          <span class="http-timeout-label">超时</span>
          <input v-model.number="timeoutSecs" type="number" min="1" max="60" class="http-timeout-input" />
          <span class="http-timeout-unit">s</span>
        </div>
      </div>
    </template>

    <template #settings>
      <div class="http-request-settings">
        <div class="io-block">
          <div class="http-setting-head">
            <div>
              <strong>请求头</strong>
              <span>每行使用 Header: value</span>
            </div>
            <SelectMenu :model-value="headerPreset" class="http-preset-select" :options="headerPresetOptions" @update:model-value="setPresetHeaders" />
          </div>
          <textarea
            v-model="headersText"
            class="tool-textarea http-request-editor"
            aria-label="请求头"
            placeholder="Content-Type: application/json&#10;Authorization: Bearer xxx"
          ></textarea>
        </div>

        <div class="io-block">
          <div class="io-label">{{ usesMultipart ? 'Multipart 字段（每行 name=value）' : '请求体（GET / HEAD 不发送）' }}</div>
          <textarea
            v-if="usesMultipart"
            v-model="multipartFieldsText"
            class="tool-textarea http-request-editor"
            aria-label="Multipart 字段"
            placeholder="name=value&#10;description=Dev Toolbox"
          ></textarea>
          <textarea
            v-else
            v-model="bodyText"
            class="tool-textarea http-request-editor"
            aria-label="请求体"
            placeholder='{"key": "value"}'
          ></textarea>
        </div>
      </div>
    </template>

    <template #preview-actions>
      <span
        class="status-pill"
        :class="{
          running: busy,
          error: Boolean(errorMessage) || (statusCode !== null && statusCode >= 400),
          success: statusCode !== null && statusCode < 400
        }"
      >
        {{ busy ? "请求中" : errorMessage ? "请求失败" : statusCode !== null ? `HTTP ${statusCode}` : "等待请求" }}
      </span>
    </template>

    <template #preview>
      <div class="http-response-shell">
        <div v-if="busy" class="empty-state http-response-empty">
          <i class="ri-loader-4-line" aria-hidden="true"></i>
          <strong>正在等待服务器响应</strong>
          <span>请求完成后会在这里展示完整响应</span>
        </div>

        <div v-else-if="!hasResponse" class="empty-state http-response-empty">
          <i class="ri-terminal-box-line" aria-hidden="true"></i>
          <strong>尚未发送请求</strong>
          <span>填写接口地址并发送请求后查看结果</span>
        </div>

        <div v-else class="response-section">
          <div class="response-overview">
            <div>
              <span class="response-overview-label">HTTP 状态</span>
              <strong v-if="statusCode !== null" :class="statusCode < 400 ? 'status-success' : 'status-error'">
                {{ statusCode }} {{ statusText }}
              </strong>
              <strong v-else class="status-error">请求失败</strong>
            </div>
            <div>
              <span class="response-overview-label">响应耗时</span>
              <strong>{{ responseTimeMs ? `${responseTimeMs}ms` : "--" }}</strong>
            </div>
            <div>
              <span class="response-overview-label">响应头</span>
              <strong>{{ responseHeaderCount }} 项</strong>
            </div>
          </div>

          <div v-if="errorMessage" class="response-error">{{ errorMessage }}</div>
          <p v-if="responseTruncated" class="warning-banner response-warning">响应体超过 10 MiB，当前仅显示截断预览。</p>

          <div v-if="responseHeaderCount" class="response-headers">
            <div class="io-label">响应头</div>
            <div class="header-grid">
              <div v-for="(val, key) in responseHeaders" :key="key" class="header-row">
                <span class="header-key">{{ key }}</span><span class="header-val">{{ val }}</span>
              </div>
            </div>
          </div>

          <div v-if="responseBody" class="io-block response-body-block">
            <div class="io-label">{{ responseBodyEncoding === 'base64' ? '二进制响应（Base64 预览）' : '响应体' }}</div>
            <textarea class="tool-textarea response-body-editor" readonly :value="responseBody"></textarea>
          </div>

          <div v-else-if="statusCode !== null" class="empty-state response-body-empty">
            当前响应没有正文
          </div>
        </div>
      </div>
    </template>

    <template #summary>
      <i class="ri-timer-line" aria-hidden="true"></i>
      <span>{{ method }} · {{ timeoutSecs }}s{{ statusCode !== null ? ` · HTTP ${statusCode}` : "" }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="busy || !url" @click="sendRequest">
        <i class="ri-send-plane-line" aria-hidden="true"></i>
        {{ busy ? "请求中…" : "发送请求" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
<style scoped>
.http-request-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
}

.http-url-input {
  flex: 1;
  min-width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  outline: none;
}
.http-url-input:focus { border-color: var(--accent); }

.http-method-select {
  width: 112px;
  flex-shrink: 0;
}

.http-preset-select {
  width: 100%;
}

.http-timeout-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.http-timeout-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.http-timeout-input {
  width: 44px;
  padding: 3px 6px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  text-align: center;
  outline: none;
  min-height: unset;
}

.http-timeout-unit {
  font-size: 12px;
  color: var(--muted);
}

.http-request-settings {
  display: grid;
  gap: 16px;
}

.http-request-settings .io-block {
  display: grid;
  gap: 8px;
}

.http-setting-head {
  display: grid;
  gap: 8px;
}

.http-setting-head > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.http-setting-head strong,
.http-setting-head span {
  font-size: 12px;
}

.http-setting-head span {
  color: var(--muted);
  font-weight: 400;
}

.http-request-editor {
  min-height: 104px;
  height: 104px;
  resize: vertical;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12px;
}

.http-response-shell {
  width: 100%;
  height: 100%;
  min-height: 270px;
}

.http-response-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 7px;
  height: 100%;
  min-height: 260px;
  margin: 0;
  text-align: center;
}

.http-response-empty i {
  color: var(--accent-strong);
  font-size: 28px;
}

.http-response-empty strong {
  color: var(--text);
  font-size: 13px;
}

.http-response-empty span {
  color: var(--muted);
  font-size: 12px;
}

.http-response-empty .ri-loader-4-line {
  animation: http-spin 0.9s linear infinite;
}

.response-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.response-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
  overflow: hidden;
}

.response-overview > div {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
}

.response-overview > div + div {
  border-left: 1px solid var(--border);
}

.response-overview-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.response-overview strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.response-overview strong.status-success { color: var(--success); }
.response-overview strong.status-error { color: var(--danger); }

.response-error {
  background: var(--danger-subtle, rgba(220,38,38,.1));
  color: var(--danger);
  padding: 8px 12px;
  border-radius: 6px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12px;
}

.response-warning {
  margin: 0;
}

.response-headers {
  flex: 0 1 116px;
  min-height: 60px;
  overflow: auto;
}

.header-grid {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.header-row {
  display: grid;
  grid-template-columns: minmax(110px, 0.42fr) minmax(0, 1fr);
  gap: 12px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.header-key {
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
}

.header-val {
  color: var(--text);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
}

.response-body-block {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  flex: 1;
  gap: 7px;
  min-height: 150px;
}

.response-body-editor {
  width: 100%;
  height: 100%;
  min-height: 140px;
  resize: none;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12px;
}

.response-body-empty {
  display: grid;
  place-content: center;
  flex: 1;
  min-height: 140px;
  margin: 0;
}

.status-success { color: var(--success); }
.status-error { color: var(--danger); }

@keyframes http-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .http-response-empty .ri-loader-4-line {
    animation: none;
  }
}

@media (max-width: 720px) {
  .http-request-bar {
    flex-wrap: wrap;
  }

  .http-url-input {
    order: 3;
    width: 100%;
  }

  .response-overview {
    grid-template-columns: 1fr;
  }

  .response-overview > div + div {
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}
</style>
