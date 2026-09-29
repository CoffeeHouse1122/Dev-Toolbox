<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SharedDiskConfig, SharedDiskStatus } from "../../shared/types";
import { parseSharedPath, sharedDirectory } from "../../shared/shared-disk";
import Checkbox from "../components/Checkbox.vue";

const config = ref<SharedDiskConfig>({
  sharePath: "", authMode: "windows", username: "", password: "",
  defaultDirectory: "", rememberCredentials: false
});
const busy = ref("");
const status = ref<SharedDiskStatus>({ connected: false, state: "unknown", shareRoot: "", message: "填写共享路径后检查连接状态" });
const error = ref("");
const notice = ref("");
const lastOperation = ref("");
const checkedAt = ref("");
const checking = ref(false);
const showPassword = ref(false);
const confirmation = ref<"disconnect" | "forget" | null>(null);
const savedIdentity = ref("");
const savedSharePath = ref("");
const hasStoredPassword = ref(false);
const baseline = ref("");
let disposed = false;
let revision = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let editTimer: ReturnType<typeof setTimeout> | undefined;

function payload(): SharedDiskConfig {
  return { sharePath: config.value.sharePath, authMode: config.value.authMode,
    username: config.value.username, password: config.value.password,
    defaultDirectory: config.value.defaultDirectory, rememberCredentials: config.value.rememberCredentials };
}
function identity(value: SharedDiskConfig) {
  try { return JSON.stringify([parseSharedPath(value.sharePath).shareRoot.toLowerCase(), value.authMode, value.username.trim().toLowerCase()]); }
  catch { return ""; }
}
const savedPasswordAvailable = computed(() => hasStoredPassword.value && identity(config.value) === savedIdentity.value);
const validation = computed(() => {
  if (!config.value.sharePath.trim()) return "请填写共享路径";
  try { sharedDirectory(config.value.sharePath, config.value.defaultDirectory); return ""; }
  catch (cause) { return (cause as Error).message; }
});
const canConnect = computed(() => !validation.value && (config.value.authMode === "windows" ||
  Boolean(config.value.username.trim() && (config.value.password || savedPasswordAvailable.value))));
const dirty = computed(() => JSON.stringify(payload()) !== baseline.value);
const locked = computed(() => Boolean(busy.value || confirmation.value));
const canOpen = computed(() => status.value.connected && !dirty.value && !validation.value);
const statusLabel = computed(() => busy.value === "connect" ? "连接中" : checking.value ? "检查中" :
  status.value.connected ? "已连接" : status.value.state === "unknown" ? "待确认" : "未连接");
const openTarget = computed(() => {
  try { return sharedDirectory(config.value.sharePath, config.value.defaultDirectory); } catch { return ""; }
});
function friendly(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': Error:\s*/i, "");
}
function applySaved(value: SharedDiskConfig) {
  config.value = { ...value, password: "" };
  baseline.value = JSON.stringify(payload());
  savedIdentity.value = identity(value);
  savedSharePath.value = value.sharePath;
  hasStoredPassword.value = Boolean(value.hasSavedPassword);
  notice.value = value.migrationNotice || "";
}
async function refreshStatus() {
  if (disposed || document.hidden || checking.value || busy.value || validation.value) return;
  const capturedRevision = revision;
  const sharePath = config.value.sharePath;
  checking.value = true;
  try {
    const next = await window.devToolbox.getSharedDiskStatus({ sharePath });
    if (!disposed && capturedRevision === revision) {
      status.value = next;
      checkedAt.value = new Date().toLocaleTimeString();
    }
  } catch (cause) {
    if (!disposed && capturedRevision === revision) status.value = { connected: false, state: "unknown", shareRoot: "", message: friendly(cause) };
  } finally { checking.value = false; }
}
watch(() => [config.value.sharePath, config.value.defaultDirectory], () => {
  revision++;
  status.value = { connected: false, state: "unknown", shareRoot: "", message: "目标已变更，等待检查" };
  checkedAt.value = "";
  clearTimeout(editTimer);
  editTimer = setTimeout(() => void refreshStatus(), 500);
});
watch(() => config.value.authMode, () => {
  config.value.password = "";
  showPassword.value = false;
  if (config.value.authMode === "windows") config.value.rememberCredentials = false;
});
watch(() => [config.value.sharePath, config.value.username], () => {
  config.value.password = "";
  showPassword.value = false;
});
async function run(action: string, work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = action;
  revision++;
  error.value = "";
  try { await work(); } catch (cause) { error.value = friendly(cause); }
  finally { busy.value = ""; }
}
async function saveConfig() {
  await run("save", async () => {
    applySaved(await window.devToolbox.saveSharedDiskConfig(payload()));
    lastOperation.value = config.value.rememberCredentials ? "配置和加密凭据已保存" : "配置已保存，未保存密码";
  });
}
async function openDirectory() {
  await run("open", async () => {
    await window.devToolbox.openSharedDiskDirectory(openTarget.value);
    lastOperation.value = "已请求在资源管理器中打开目录";
  });
}
async function connect() {
  if (!canConnect.value) return;
  await run("connect", async () => {
    const result = await window.devToolbox.connectSharedDisk(payload());
    lastOperation.value = result.message;
    status.value = { connected: true, state: "connected", shareRoot: result.shareRoot, message: result.message };
    config.value.password = "";
    showPassword.value = false;
    const saved = await window.devToolbox.loadSharedDiskConfig();
    if (saved.sharePath === result.baseUncPath && !result.message.includes("保存失败")) applySaved(saved);
    // Opening is a separate step: a directory error must not be reported as a login failure.
    try {
      await window.devToolbox.openSharedDiskDirectory(result.defaultDirectory);
    } catch (cause) { error.value = "连接已成功，但打开目录失败：" + friendly(cause); }
  });
  await refreshStatus();
}
async function confirmAction() {
  const action = confirmation.value;
  confirmation.value = null;
  if (action === "disconnect") {
    await run("disconnect", async () => {
      const result = await window.devToolbox.disconnectSharedDisk({ sharePath: config.value.sharePath });
      lastOperation.value = result.message;
      status.value = { connected: false, state: "disconnected", shareRoot: result.shareRoot, message: result.message };
    });
    await refreshStatus();
  } else if (action === "forget") {
    await run("forget", async () => {
      await window.devToolbox.forgetSharedDiskCredentials();
      hasStoredPassword.value = false;
      config.value.rememberCredentials = false;
      config.value.password = "";
      lastOperation.value = "已删除应用保存的密码；当前连接和 Windows 凭据未更改";
    });
  }
}
function onVisibility() { if (!document.hidden) void refreshStatus(); }
onMounted(async () => {
  await run("load", async () => applySaved(await window.devToolbox.loadSharedDiskConfig()));
  if (disposed) return;
  await refreshStatus();
  if (disposed) return;
  pollTimer = setInterval(() => void refreshStatus(), 15_000);
  document.addEventListener("visibilitychange", onVisibility);
});
onBeforeUnmount(() => {
  disposed = true;
  revision++;
  clearInterval(pollTimer);
  clearTimeout(editTimer);
  config.value.password = "";
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <section class="tool-page shared-connection">
    <header class="tool-header">
      <div><h2>Windows 共享连接</h2><p>连接 SMB 共享，在资源管理器中打开文件；不用于 NAS 网页登录</p></div>
      <span class="protocol-label">SMB / WINDOWS</span>
    </header>

    <p v-if="notice" class="connection-notice" role="status">{{ notice }}</p>

    <div class="connection-grid">
      <form class="connection-panel connection-form" @submit.prevent="canOpen ? openDirectory() : connect()">
        <div class="panel-heading"><h3>连接配置</h3><span class="subtle-label">{{ dirty ? "尚未保存" : "本机配置" }}</span></div>
        <fieldset :disabled="locked">
          <label class="field">
            <span>共享路径 <span class="required-mark">*</span></span>
            <input v-model="config.sharePath" class="technical-text" placeholder="\\server\share" spellcheck="false" autocomplete="off" aria-describedby="share-path-help" />
            <small id="share-path-help">粘贴完整 UNC 路径，可包含子目录；不填写 http:// 或端口。</small>
          </label>
          <p v-if="config.sharePath && validation" class="field-error" role="status">{{ validation }}</p>

          <div class="field"><span>登录方式</span>
            <div class="auth-options" role="group" aria-label="登录方式">
              <button type="button" :aria-pressed="config.authMode === 'windows'" :class="{ selected: config.authMode === 'windows' }" @click="config.authMode = 'windows'"><i class="ri-windows-fill" aria-hidden="true"></i> 当前 Windows 身份</button>
              <button type="button" :aria-pressed="config.authMode === 'account'" :class="{ selected: config.authMode === 'account' }" @click="config.authMode = 'account'"><i class="ri-user-line" aria-hidden="true"></i> 指定账号</button>
            </div>
          </div>
          <p v-if="config.authMode === 'windows'" class="identity-note">使用 Windows 当前可用的身份或系统已有凭据，无需在此填写密码。</p>
          <div v-else class="account-fields">
            <label class="field"><span>账号</span><input v-model="config.username" class="technical-text" placeholder="账号或 DOMAIN\username" autocomplete="username" spellcheck="false" /></label>
            <label class="field"><span>密码 <span v-if="savedPasswordAvailable" class="saved-label">已加密保存 · 留空沿用</span></span>
              <span class="password-field"><input v-model="config.password" :type="showPassword ? 'text' : 'password'" :placeholder="savedPasswordAvailable ? '输入新密码可替换' : '输入密码'" autocomplete="current-password" />
                <button type="button" class="icon-button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" :aria-pressed="showPassword" @click="showPassword = !showPassword"><i :class="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'" aria-hidden="true"></i></button>
              </span>
            </label>
            <Checkbox v-model="config.rememberCredentials" :disabled="locked" label="记住凭据（仅在本应用加密保存）" />
          </div>

          <details class="advanced-options">
            <summary>高级设置 <span>默认打开目录</span></summary>
            <label class="field"><span>默认打开目录（可选）</span><input v-model="config.defaultDirectory" class="technical-text" placeholder="留空使用共享路径" spellcheck="false" /><small>必须位于上方共享路径内。</small></label>
          </details>
        </fieldset>
        <p class="privacy-note"><i class="ri-shield-check-line" aria-hidden="true"></i> 不内置服务器或账号，不自动断开其他连接。未勾选记住凭据时，应用不保存密码。</p>
        <div class="form-actions">
          <button type="button" class="secondary-button" :disabled="locked || !!validation || (config.authMode === 'account' && !config.username.trim())" @click="saveConfig">{{ busy === "save" ? "保存中…" : "保存配置" }}</button>
          <button type="submit" class="primary-button" :disabled="locked || (!canOpen && !canConnect)"><i :class="canOpen ? 'ri-folder-open-line' : 'ri-link'" aria-hidden="true"></i>{{ busy === "connect" ? "连接中…" : busy === "open" ? "打开中…" : canOpen ? "打开目录" : "连接并打开" }}</button>
        </div>
      </form>

      <aside class="connection-panel connection-status">
        <div class="panel-heading"><h3>连接状态</h3><button type="button" class="icon-button" aria-label="刷新连接状态" :disabled="locked || checking || !!validation" @click="refreshStatus"><i class="ri-refresh-line" aria-hidden="true"></i></button></div>
        <div class="status-summary" :class="{ connected: status.connected, failed: !!error }" role="status" aria-live="polite">
          <i :class="error ? 'ri-error-warning-line' : status.connected ? 'ri-link' : 'ri-link-unlink'" aria-hidden="true"></i>
          <div><strong>{{ statusLabel }}</strong><p>{{ status.message }}</p></div>
        </div>
        <div class="target-summary"><span>打开位置</span><code>{{ openTarget || "尚未设置" }}</code></div>
        <p class="status-footnote">{{ checkedAt ? "上次检查 " + checkedAt : "等待检查" }} · 页面可见时每 15 秒刷新</p>
        <p v-if="lastOperation" class="operation-note" role="status">{{ lastOperation }}</p>
        <p v-if="error" class="connection-error" role="alert">{{ error }}</p>
        <div class="status-actions">
          <button type="button" class="secondary-button" :disabled="locked || !!validation" @click="confirmation = 'disconnect'">断开此共享</button>
          <button type="button" class="text-action" :disabled="locked || !hasStoredPassword" @click="confirmation = 'forget'">忘记已保存凭据</button>
        </div>
        <div v-if="confirmation" class="confirm-box" role="alert">
          <strong>{{ confirmation === "disconnect" ? "确认断开此共享？" : "确认忘记应用凭据？" }}</strong>
          <p>{{ confirmation === "disconnect" ? "可能影响其他程序对同一共享的访问；有文件正在使用时不会强制断开。凭据将保留。" : "只删除本应用保存的密码，不断开当前连接，也不删除 Windows 凭据管理器中的记录。" }}</p>
          <code>{{ confirmation === "disconnect" ? config.sharePath : savedSharePath }}</code>
          <div><button type="button" class="secondary-button" @click="confirmation = null">取消</button><button type="button" class="primary-button" @click="confirmAction">确认</button></div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.shared-connection { display: grid; align-content: start; gap: 20px; }
.protocol-label, .subtle-label { color: var(--muted); font-size: 11px; letter-spacing: .06em; }
.connection-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .85fr); gap: 18px; align-items: start; }
.connection-panel { padding: 22px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); min-width: 0; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.panel-heading h3 { margin: 0; font-size: 15px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 20px; }
.field { display: grid; gap: 8px; min-width: 0; }
.field small, .identity-note, .privacy-note, .status-footnote { color: var(--muted); font-size: 12px; line-height: 1.7; margin: 0; }
.technical-text, code { font-family: ui-monospace, Consolas, monospace; font-variant-ligatures: none; }
.required-mark, .field-error { color: var(--danger); }
.field-error { font-size: 12px; margin: -10px 0 0; }
.auth-options { display: flex; gap: 8px; flex-wrap: wrap; }
.auth-options button { flex: 1; min-height: 42px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-subtle); color: var(--muted); cursor: pointer; }
.auth-options button.selected { color: var(--accent-strong); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.account-fields { display: grid; gap: 16px; }
.saved-label { font-size: 11px; color: var(--accent-strong); margin-left: 8px; }
.password-field { display: flex; gap: 6px; align-items: center; }
.password-field input { flex: 1; min-width: 0; }
.advanced-options { border-top: 1px solid var(--border); padding-top: 16px; }
.advanced-options summary { cursor: pointer; font-size: 13px; }
.advanced-options summary span { color: var(--muted); margin-left: 8px; font-size: 12px; }
.advanced-options .field { margin-top: 16px; }
.privacy-note { margin: 20px 0; }
.privacy-note i { color: var(--accent-strong); margin-right: 5px; }
.form-actions, .status-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.form-actions { justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 18px; }
.status-summary { display: flex; gap: 14px; align-items: flex-start; padding: 18px 0; }
.status-summary > i { font-size: 28px; color: var(--muted); }
.status-summary.connected > i { color: var(--success); }
.status-summary.failed > i { color: var(--danger); }
.status-summary strong { font-size: 20px; }
.status-summary p { color: var(--muted); font-size: 12px; margin: 8px 0 0; line-height: 1.7; }
.target-summary { border-block: 1px solid var(--border); padding: 18px 0; display: grid; gap: 8px; }
.target-summary > span { font-size: 12px; color: var(--muted); }
code { overflow-wrap: anywhere; font-size: 13px; }
.status-footnote { margin: 14px 0 20px; }
.operation-note, .connection-notice { font-size: 12px; line-height: 1.7; padding: 12px; background: var(--surface-subtle); border-radius: 6px; }
.connection-notice { margin: 0; border-left: 3px solid var(--accent); }
.connection-error { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, transparent); border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.text-action { border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; padding: 8px 0; }
.confirm-box { border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-top: 16px; }
.confirm-box p { font-size: 12px; line-height: 1.7; color: var(--muted); }
.confirm-box > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 900px) { .connection-grid { grid-template-columns: 1fr; } .protocol-label { display: none; } }
</style>
