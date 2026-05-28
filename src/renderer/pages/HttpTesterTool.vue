<script setup lang="ts">
import { ref, computed } from "vue";
import SelectMenu from "../components/SelectMenu.vue";

const method = ref("GET");
const url = ref("");
const headersText = ref("");
const bodyText = ref("");
const timeoutSecs = ref(10);
const headerPreset = ref("");

const busy = ref(false);
const statusCode = ref<number | null>(null);
const statusText = ref("");
const responseHeaders = ref<Record<string, string>>({});
const responseBody = ref("");
const responseTimeMs = ref(0);
const errorMessage = ref("");

// 常用 Content-Type 快捷预设
const presetHeaders: Record<string, string> = {
  "application/json": "Content-Type: application/json\nAccept: application/json",
  "application/x-www-form-urlencoded": "Content-Type: application/x-www-form-urlencoded",
  "multipart/form-data": "Content-Type: multipart/form-data",
  "text/plain": "Content-Type: text/plain",
  "application/xml": "Content-Type: application/xml\nAccept: application/xml",
};

const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((value) => ({ label: value, value }));
const headerPresetOptions = computed(() => [
  { label: "手动输入", value: "" },
  ...Object.keys(presetHeaders).map((value) => ({ label: value, value }))
]);

function setPresetHeaders(type: string) {
  headerPreset.value = type;
  headersText.value = presetHeaders[type] || "";
}

function parseHeaders(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  raw.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim();
      if (key) result[key] = val;
    }
  });
  return result;
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

  const startTime = performance.now();
  try {
    const headers = parseHeaders(headersText.value);
    const fetchOptions: RequestInit = {
      method: method.value,
      headers: headers as any,
      signal: AbortSignal.timeout(timeoutSecs.value * 1000)
    };
    if (method.value !== "GET" && method.value !== "HEAD" && bodyText.value) {
      fetchOptions.body = bodyText.value;
    }

    const res = await fetch(url.value, fetchOptions);

    statusCode.value = res.status;
    statusText.value = res.statusText;
    responseTimeMs.value = Math.round(performance.now() - startTime);

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => { resHeaders[key] = val; });
    responseHeaders.value = resHeaders;

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await res.json();
      responseBody.value = JSON.stringify(json, null, 2);
    } else {
      responseBody.value = await res.text();
    }
  } catch (err: any) {
    errorMessage.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>HTTP 请求测试器</h2>
        <p>发送 HTTP 请求，查看响应头与响应体（轻量 Postman 替代）</p>
      </div>
      <div class="header-actions">
        <button type="button" class="primary-button" :disabled="busy || !url" @click="sendRequest">
          <i class="ri-send-plane-line" aria-hidden="true" style="margin-right:6px;"></i>
          发送请求
        </button>
      </div>
    </div>

    <div class="tool-main">
      <!-- 请求栏 -->
      <div class="http-request-bar">
        <SelectMenu v-model="method" class="http-method-select" :options="methodOptions" />
        <input v-model="url" class="http-url-input" placeholder="https://api.example.com/endpoint" />
        <div class="http-timeout-group">
          <span class="http-timeout-label">超时</span>
          <input v-model.number="timeoutSecs" type="number" min="1" max="60" class="http-timeout-input" />
          <span class="http-timeout-unit">s</span>
        </div>
      </div>

      <div class="io-pair">
        <!-- 请求配置 -->
        <div class="io-block">
          <div class="io-label">
            请求头
            <span style="font-weight:400;color:var(--muted);margin-left:8px;">快捷设置</span>
            <SelectMenu :model-value="headerPreset" class="http-preset-select" :options="headerPresetOptions" @update:model-value="setPresetHeaders" />
          </div>
          <textarea v-model="headersText" class="tool-textarea" placeholder="Content-Type: application/json&#10;Authorization: Bearer xxx" style="height:120px;"></textarea>
        </div>

        <div class="io-block">
          <div class="io-label">请求体（仅 POST/PUT/PATCH 发送）</div>
          <textarea v-model="bodyText" class="tool-textarea" placeholder='{"key": "value"}' style="height:120px;"></textarea>
        </div>
      </div>

      <!-- 响应 -->
      <div class="response-section" v-if="statusCode !== null || errorMessage">
        <div class="io-label">
          响应
          <span v-if="statusCode" :class="statusCode < 400 ? 'status-success' : 'status-error'" style="font-weight:600;margin-left:8px;">
            {{ statusCode }} {{ statusText }}
          </span>
          <span v-if="responseTimeMs" style="color:var(--muted);margin-left:8px;">{{ responseTimeMs }}ms</span>
        </div>

        <div v-if="errorMessage" class="response-error">{{ errorMessage }}</div>

        <div v-if="Object.keys(responseHeaders).length" class="response-headers">
          <div class="io-label" style="font-size:12px;">响应头</div>
          <div class="header-grid">
            <div v-for="(val, key) in responseHeaders" :key="key" class="header-row">
              <span class="header-key">{{ key }}</span><span class="header-val">{{ val }}</span>
            </div>
          </div>
        </div>

        <div class="io-block" style="margin-top:12px;" v-if="responseBody">
          <div class="io-label">响应体</div>
          <textarea class="tool-textarea" readonly :value="responseBody" style="min-height:200px;font-family:var(--font-mono, monospace);font-size:13px;"></textarea>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.http-request-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
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
  display: inline-flex;
  width: 260px;
  margin-left: 4px;
  vertical-align: middle;
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

.response-section {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-subtle);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.response-error {
  background: var(--danger-subtle, rgba(220,38,38,.1));
  color: var(--danger);
  padding: 8px 12px;
  border-radius: 6px;
  margin: 8px 0;
  font-family: var(--font-mono, monospace);
}

.response-headers {
  margin-top: 12px;
}

.header-grid {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.header-row {
  display: grid;
  grid-template-columns: minmax(120px, auto) 1fr;
  gap: 12px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
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

.status-success { color: var(--success); }
.status-error { color: var(--danger); }
</style>
