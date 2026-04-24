<script setup lang="ts">
import { computed, ref } from "vue";

const token = ref(
  ""
);
const status = ref("");

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
    // Decode UTF-8 properly
    return decodeURIComponent(
      Array.prototype.map
        .call(binary, (c: string) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join("")
    );
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
      status.value = "已从剪贴板粘贴。";
    }
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  }
}

function clear() {
  token.value = "";
  status.value = "";
}

function loadSample() {
  token.value =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldiBUb29sYm94IiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQwMDAwMDAwMDB9.xDr9kFAkgYpWZBoAfH1KXcrMMZh4kcb3gJL_wGfQRYI";
  status.value = "已载入示例。";
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>JWT 解析器</h2>
        <p>本地解码 JWT 的 Header / Payload / Signature，所有数据不会发送到任何服务端</p>
      </div>
      <div class="header-actions">
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
    </div>

    <div class="tool-main">
      <div class="jwt-section">
        <div class="jwt-label">
          <i class="ri-key-2-line" aria-hidden="true"></i>
          编码后的 Token
        </div>
        <textarea v-model="token" class="tool-textarea" placeholder="粘贴 JWT，例如 xxxxx.yyyyy.zzzzz"></textarea>
        <p v-if="status" class="empty-state">{{ status }}</p>
        <p v-if="segments && segments.parts.length > 0" class="jwt-token">
          <span class="jwt-segment-header">{{ segments.parts[0] || "" }}</span><span v-if="segments.parts.length > 1">.</span><span class="jwt-segment-payload">{{ segments.parts[1] || "" }}</span><span v-if="segments.parts.length > 2">.</span><span class="jwt-segment-signature">{{ segments.parts[2] || "" }}</span>
        </p>
      </div>

      <div v-if="segments" class="dual-pane" style="margin-top: 16px;">
        <div class="code-pane">
          <div class="pane-head">
            <strong style="color: #d63384;">Header</strong>
          </div>
          <textarea readonly :value="segments.header.pretty"></textarea>
          <p v-if="segments.header.error" class="error-banner">{{ segments.header.error }}</p>
        </div>
        <div class="code-pane">
          <div class="pane-head">
            <strong style="color: #6f42c1;">Payload</strong>
            <span v-if="claims && claims.exp" class="status-pill" :class="{ error: isExpired, success: !isExpired }">
              {{ isExpired ? "已过期" : "有效" }}
            </span>
          </div>
          <textarea readonly :value="segments.payload.pretty"></textarea>
          <p v-if="segments.payload.error" class="error-banner">{{ segments.payload.error }}</p>
        </div>
      </div>

      <div v-if="claims" class="info-grid" style="margin-top: 16px;">
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
  </section>
</template>
