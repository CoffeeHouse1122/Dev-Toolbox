<script setup lang="ts">
import { computed, ref } from "vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const token = ref(
  ""
);

type DecodedPart = {
  raw: string;
  pretty: string;
  error?: string;
};

function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  if (typeof atob !== "function") return "";
  const binary = atob(s);
  try {
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return binary;
  }
}

function decodePart(raw: string): DecodedPart {
  if (!raw) return { raw, pretty: "" };
  try {
    const text = base64UrlDecode(raw);
    try {
      const obj = JSON.parse(text);
      return { raw, pretty: JSON.stringify(obj, null, 2) };
    } catch {
      return { raw, pretty: text };
    }
  } catch (error) {
    return { raw, pretty: "", error: error instanceof Error ? error.message : String(error) };
  }
}

const segments = computed(() => {
  const trimmed = token.value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length < 2) {
    return {
      header: { raw: "", pretty: "", error: "无效 JWT：至少需要 header.payload。" } as DecodedPart,
      payload: { raw: "", pretty: "" } as DecodedPart,
      signature: "",
      parts
    };
  }
  return {
    header: decodePart(parts[0] ?? ""),
    payload: decodePart(parts[1] ?? ""),
    signature: parts[2] ?? "",
    parts
  };
});

const claims = computed(() => {
  const payload = segments.value?.payload?.pretty;
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    return obj;
  } catch {
    return null;
  }
});

const issuedAt = computed(() => formatTime(claims.value?.iat as number | undefined));
const notBefore = computed(() => formatTime(claims.value?.nbf as number | undefined));
const expiresAt = computed(() => formatTime(claims.value?.exp as number | undefined));
const isExpired = computed(() => {
  const exp = claims.value?.exp as number | undefined;
  return typeof exp === "number" && exp * 1000 < Date.now();
});
const tokenStatus = computed(() => {
  if (!token.value.trim()) return "等待输入";
  return `${segments.value?.parts.length ?? 0} 段`;
});

function formatTime(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  const d = new Date(seconds * 1000);
  return d.toLocaleString();
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      token.value = text.trim();
      showWorkspaceToast("已从剪贴板粘贴。", "success");
    }
  } catch (error) {
    showWorkspaceToast(error instanceof Error ? error.message : String(error), "error");
  }
}

function clear() {
  token.value = "";
}

function loadSample() {
  token.value =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldiBUb29sYm94IiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQwMDAwMDAwMDB9.xDr9kFAkgYpWZBoAfH1KXcrMMZh4kcb3gJL_wGfQRYI";
  showWorkspaceToast("已载入示例。", "success");
}
</script>

<template>
  <TaskFlowLayout
    title="JWT 解析器"
    description="本地解码 JWT 的 Header / Payload / Signature，所有数据不会发送到任何服务端"
    source-title="编码后的 Token"
    source-description="粘贴 JWT 后立即拆分并解码，无需上传或执行"
    settings-title="Token 结构与声明"
    settings-description="核对原始分段、常见声明和时间信息"
    preview-title="解码内容"
    preview-description="分别查看 Header 与 Payload 的格式化结果"
    :file-label="tokenStatus"
    variant="analysis"
  >
    <template #source-actions>
      <div class="jwt-source-actions">
        <button type="button" class="secondary-button" @click="pasteFromClipboard">
          <i class="ri-clipboard-line" aria-hidden="true"></i>
          粘贴
        </button>
        <button type="button" class="secondary-button" @click="loadSample">
          <i class="ri-flask-line" aria-hidden="true"></i>
          示例
        </button>
        <button type="button" class="secondary-button" @click="clear">
          <i class="ri-eraser-line" aria-hidden="true"></i>
          清空
        </button>
      </div>
    </template>

    <template #source>
      <textarea
        v-model="token"
        class="tool-textarea compact jwt-input"
        placeholder="粘贴 JWT，例如 xxxxx.yyyyy.zzzzz"
      ></textarea>
    </template>

    <template #settings>
      <div v-if="segments" class="jwt-inspector">
        <p v-if="segments.parts.length > 0" class="jwt-token">
          <span class="jwt-segment-header">{{ segments.parts[0] || "" }}</span><span v-if="segments.parts.length > 1">.</span><span class="jwt-segment-payload">{{ segments.parts[1] || "" }}</span><span v-if="segments.parts.length > 2">.</span><span class="jwt-segment-signature">{{ segments.parts[2] || "" }}</span>
        </p>

        <p class="warning-banner jwt-warning">
          此工具只解码内容并检查时间声明，不验证签名、签发者或受众；不能据此判断 Token 可信或有效。
        </p>

        <div v-if="claims" class="info-grid jwt-claims-grid">
          <div class="info-panel">
            <h3>常见声明</h3>
            <div class="info-list">
              <div v-if="claims.iss" class="info-row"><span>iss (Issuer)</span><strong>{{ claims.iss }}</strong></div>
              <div v-if="claims.sub" class="info-row"><span>sub (Subject)</span><strong>{{ claims.sub }}</strong></div>
              <div v-if="claims.aud" class="info-row"><span>aud (Audience)</span><strong>{{ Array.isArray(claims.aud) ? claims.aud.join(", ") : claims.aud }}</strong></div>
              <div v-if="claims.jti" class="info-row"><span>jti</span><strong>{{ claims.jti }}</strong></div>
            </div>
          </div>
          <div class="info-panel">
            <h3>时间</h3>
            <div class="info-list">
              <div v-if="issuedAt" class="info-row"><span>iat (签发时间)</span><strong>{{ issuedAt }}</strong></div>
              <div v-if="notBefore" class="info-row"><span>nbf (生效时间)</span><strong>{{ notBefore }}</strong></div>
              <div v-if="expiresAt" class="info-row"><span>exp (过期时间)</span><strong>{{ expiresAt }}</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state jwt-settings-empty">输入 Token 后显示结构与声明</div>
    </template>

    <template #preview-actions>
      <span v-if="claims && claims.exp" class="status-pill" :class="{ error: isExpired, running: !isExpired }">
        {{ isExpired ? "已过期 · 未验签" : "未过期 · 未验签" }}
      </span>
      <span v-else class="status-pill">本地解码</span>
    </template>

    <template #preview>
      <div v-if="segments" class="jwt-decoded-grid">
        <div class="code-pane jwt-code-pane">
          <div class="pane-head">
            <strong class="jwt-header-label">Header</strong>
          </div>
          <textarea readonly :value="segments.header.pretty"></textarea>
          <p v-if="segments.header.error" class="error-banner">{{ segments.header.error }}</p>
        </div>
        <div class="code-pane jwt-code-pane">
          <div class="pane-head">
            <strong class="jwt-payload-label">Payload</strong>
          </div>
          <textarea readonly :value="segments.payload.pretty"></textarea>
          <p v-if="segments.payload.error" class="error-banner">{{ segments.payload.error }}</p>
        </div>
      </div>
      <div v-else class="empty-state jwt-preview-empty">输入 JWT 后在此查看解码内容</div>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.jwt-source-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.jwt-source-actions .secondary-button {
  min-height: 32px;
  padding: 4px 10px;
}

.jwt-input {
  min-height: 82px;
  max-height: 118px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}

.jwt-inspector {
  display: grid;
  gap: 12px;
}

.jwt-token,
.jwt-warning {
  margin: 0;
}

.jwt-claims-grid {
  grid-template-columns: 1fr;
  gap: 10px;
}

.jwt-claims-grid .info-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.jwt-decoded-grid {
  display: grid;
  grid-template-rows: minmax(130px, 0.8fr) minmax(180px, 1.2fr);
  gap: 12px;
  width: 100%;
  height: 100%;
  min-height: 360px;
}

.jwt-code-pane {
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.jwt-code-pane textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  resize: none;
}

.jwt-header-label {
  color: #d63384;
}

.jwt-payload-label {
  color: #6f42c1;
}

:global(:root[data-theme="dark"]) .jwt-header-label {
  color: #ff7b9d;
}

:global(:root[data-theme="dark"]) .jwt-payload-label {
  color: #c792ea;
}

.jwt-settings-empty,
.jwt-preview-empty {
  min-height: 100%;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

@media (max-width: 720px) {
  .jwt-decoded-grid {
    grid-template-rows: repeat(2, minmax(220px, auto));
    height: auto;
  }
}
</style>
