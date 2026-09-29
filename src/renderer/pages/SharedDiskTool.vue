<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SharedDiskConfig, SharedDiskStatus } from "../../shared/types";
import { parseSharedPath, sharedDirectory } from "../../shared/shared-disk";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import AppDialog from "../components/AppDialog.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const config = ref<SharedDiskConfig>({ sharePath: "", authMode: "windows", username: "", password: "", defaultDirectory: "", rememberCredentials: false });
const busy = ref("");
const status = ref<SharedDiskStatus>({ connected: false, state: "unknown", shareRoot: "", message: "填写共享路径后检查连接状态" });
const error = ref("");
const checkedAt = ref("");
const checking = ref(false);
const showPassword = ref(false);
const dialog = ref<"disconnect" | "forget" | "error" | null>(null);
const savedIdentity = ref("");
const savedSharePath = ref("");
const hasStoredPassword = ref(false);
const baseline = ref("");
let disposed = false;
let active = true;
let revision = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let editTimer: ReturnType<typeof setTimeout> | undefined;

function payload(): SharedDiskConfig {
  return { sharePath: config.value.sharePath, authMode: config.value.authMode, username: config.value.username, password: config.value.password,
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
const canConnect = computed(() => !validation.value && (config.value.authMode === "windows" || Boolean(config.value.username.trim() && (config.value.password || savedPasswordAvailable.value))));
const dirty = computed(() => JSON.stringify(payload()) !== baseline.value);
const locked = computed(() => Boolean(busy.value || dialog.value));
const canOpen = computed(() => status.value.connected && !validation.value);
const statusLabel = computed(() => busy.value === "connect" ? "连接中" : checking.value ? "检查中" : status.value.connected ? "已连接" : status.value.state === "unknown" ? "待确认" : "未连接");
const openTarget = computed(() => {
  try { return sharedDirectory(config.value.sharePath, config.value.defaultDirectory); } catch { return ""; }
});
function friendly(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': Error:\s*/i, "");
}
function reportError(cause: unknown) {
  error.value = friendly(cause);
  showWorkspaceToast(error.value, "error", 7000);
}
function applySaved(value: SharedDiskConfig) {
  config.value = { ...value, password: "" };
  baseline.value = JSON.stringify(payload());
  savedIdentity.value = identity(value);
  savedSharePath.value = value.sharePath;
  hasStoredPassword.value = Boolean(value.hasSavedPassword);
}
async function refreshStatus() {
  if (disposed || !active || document.hidden || checking.value || busy.value || validation.value) return;
  const capturedRevision = revision;
  checking.value = true;
  try {
    const next = await window.devToolbox.getSharedDiskStatus({ sharePath: config.value.sharePath });
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
  error.value = "";
  clearTimeout(editTimer);
  editTimer = setTimeout(() => void refreshStatus(), 500);
});
watch(() => config.value.authMode, () => {
  config.value.password = "";
  showPassword.value = false;
  if (config.value.authMode === "windows") config.value.rememberCredentials = false;
});
watch(() => [config.value.sharePath, config.value.username], () => { config.value.password = ""; showPassword.value = false; });
async function run(action: string, work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = action;
  revision++;
  error.value = "";
  try { await work(); } catch (cause) { reportError(cause); }
  finally { busy.value = ""; }
}
async function saveConfig() {
  await run("save", async () => {
    applySaved(await window.devToolbox.saveSharedDiskConfig(payload()));
    showWorkspaceToast("配置已保存", "success");
  });
}
async function openExisting() {
  await run("open", async () => {
    // Reuse Windows' session explicitly, without submitting or saving the form's credentials.
    await window.devToolbox.openExistingSharedDiskDirectory({ sharePath: config.value.sharePath, defaultDirectory: config.value.defaultDirectory });
    showWorkspaceToast("已使用 Windows 现有连接打开目录", "success");
  });
  await refreshStatus();
}
async function connect() {
  if (!canConnect.value) return;
  await run("connect", async () => {
    const result = await window.devToolbox.connectSharedDisk(payload());
    status.value = { connected: true, state: "connected", shareRoot: result.shareRoot, message: result.message };
    config.value.password = "";
    showPassword.value = false;
    const saved = await window.devToolbox.loadSharedDiskConfig();
    if (saved.sharePath === result.baseUncPath && !result.message.includes("保存失败")) applySaved(saved);
    try {
      await window.devToolbox.openSharedDiskDirectory(result.defaultDirectory);
      showWorkspaceToast(result.message, "success");
    } catch (cause) { reportError("连接已成功，但打开目录失败：" + friendly(cause)); }
  });
  await refreshStatus();
}
async function confirmAction() {
  const action = dialog.value;
  dialog.value = null;
  if (action === "disconnect") {
    await run("disconnect", async () => {
      const result = await window.devToolbox.disconnectSharedDisk({ sharePath: config.value.sharePath });
      status.value = { connected: false, state: "disconnected", shareRoot: result.shareRoot, message: result.message };
      showWorkspaceToast(result.message, "success");
    });
    await refreshStatus();
  } else if (action === "forget") {
    await run("forget", async () => {
      await window.devToolbox.forgetSharedDiskCredentials();
      hasStoredPassword.value = false;
      config.value.rememberCredentials = false;
      config.value.password = "";
      showWorkspaceToast("应用密码已删除；当前连接和 Windows 凭据未更改", "success");
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
onActivated(() => { active = true; void refreshStatus(); });
onDeactivated(() => { active = false; revision++; dialog.value = null; config.value.password = ""; showPassword.value = false; });
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
  <TaskFlowLayout class="shared-connection" title="Windows 共享连接" description="连接 SMB 共享，在资源管理器中打开文件；不用于 NAS 网页登录"
    source-title="共享位置" source-description="填写 UNC 路径，不使用 http:// 或端口" :file-label="dirty ? '尚未保存' : '本机配置'"
    settings-title="登录凭据" settings-description="选择连接时使用的身份" preview-title="连接状态" preview-description="识别 Windows 已有会话，无需重复登录">
    <template #source>
      <fieldset :disabled="locked" class="target-fields">
        <label class="field"><span>共享路径 <span class="required-mark">*</span></span><input v-model="config.sharePath" class="technical-text" placeholder="\\server\share" spellcheck="false" autocomplete="off" /></label>
        <label class="field"><span>默认打开目录（可选，须在共享路径内）</span><input v-model="config.defaultDirectory" class="technical-text" placeholder="留空使用共享路径" spellcheck="false" /></label>
      </fieldset>
      <p v-if="config.sharePath && validation" class="field-error" role="status">{{ validation }}</p>
    </template>
    <template #settings>
      <fieldset :disabled="locked" class="credentials">
        <div class="auth-options" role="group" aria-label="登录方式">
          <button type="button" :aria-pressed="config.authMode === 'windows'" :class="{ selected: config.authMode === 'windows' }" @click="config.authMode = 'windows'"><i class="ri-windows-fill" aria-hidden="true"></i> Windows 身份</button>
          <button type="button" :aria-pressed="config.authMode === 'account'" :class="{ selected: config.authMode === 'account' }" @click="config.authMode = 'account'"><i class="ri-user-line" aria-hidden="true"></i> 指定账号</button>
        </div>
        <p v-if="config.authMode === 'windows'" class="muted-note">使用 Windows 当前可用的身份或系统已有凭据，无需填写密码。</p>
        <template v-else>
          <label class="field"><span>账号</span><input v-model="config.username" class="technical-text" placeholder="账号或 DOMAIN\username" autocomplete="username" spellcheck="false" /></label>
          <label class="field"><span>密码 <small v-if="savedPasswordAvailable" class="saved-label">已加密保存 · 留空沿用</small></span>
            <span class="password-field"><input v-model="config.password" :type="showPassword ? 'text' : 'password'" :placeholder="savedPasswordAvailable ? '输入新密码可替换' : '输入密码'" autocomplete="current-password" />
              <button type="button" class="icon-button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" :aria-pressed="showPassword" @click="showPassword = !showPassword"><i :class="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'" aria-hidden="true"></i></button>
            </span>
          </label>
          <Checkbox v-model="config.rememberCredentials" :disabled="locked" label="记住凭据（仅在本应用加密保存）" />
        </template>
      </fieldset>
      <p class="muted-note privacy-note"><i class="ri-shield-check-line" aria-hidden="true"></i> 不自动断开其他共享；未勾选记住凭据时不保存密码。</p>
    </template>
    <template #preview-actions><button class="icon-button" aria-label="刷新连接状态" :disabled="locked || checking || !!validation" @click="refreshStatus"><i class="ri-refresh-line" aria-hidden="true"></i></button></template>
    <template #preview>
      <div class="status-summary" :class="{ connected: status.connected }" role="status">
        <i :class="status.connected ? 'ri-link' : 'ri-link-unlink'" aria-hidden="true"></i><div><strong>{{ statusLabel }}</strong><p>{{ status.message }}</p></div>
      </div>
      <div class="target-summary"><span>打开位置</span><code>{{ openTarget || '尚未设置' }}</code><template v-if="status.username"><span>现有会话账号</span><code>{{ status.username }}</code></template></div>
      <div class="status-actions">
        <button v-if="canOpen" class="primary-button open-existing" :disabled="locked" @click="openExisting"><i class="ri-folder-open-line" aria-hidden="true"></i>使用现有连接打开</button>
        <button class="secondary-button disconnect-action" :disabled="locked || !!validation" @click="dialog = 'disconnect'">断开此共享</button>
        <button class="text-action forget-action" :disabled="locked || !hasStoredPassword" @click="dialog = 'forget'">忘记已保存凭据</button>
      </div>
      <details v-if="status.sessions?.length" class="session-details"><summary>此服务器的现有共享（{{ status.sessions.length }}）</summary><ul><li v-for="session in status.sessions" :key="session.shareRoot + session.username"><code>{{ session.shareRoot }}</code><span>{{ session.username }} · {{ session.openFiles }} 个打开项</span></li></ul></details>
      <p class="muted-note">{{ checkedAt ? '上次检查 ' + checkedAt : '等待检查' }} · 页面可见时每 15 秒刷新</p>
    </template>
    <template #summary><button v-if="error" class="text-action error-detail" @click="dialog = 'error'">操作未完成 · 查看详情</button><span v-else><i class="ri-shield-check-line" aria-hidden="true"></i> {{ status.connected ? '已有连接可直接打开，无需重复登录' : '连接成功后自动打开目录' }}</span></template>
    <template #actions>
      <button class="secondary-button" :disabled="locked || !!validation || (config.authMode === 'account' && !config.username.trim())" @click="saveConfig">{{ busy === 'save' ? '保存中…' : '保存配置' }}</button>
      <button class="primary-button connect-action" :disabled="locked || !canConnect" @click="connect"><i class="ri-link" aria-hidden="true"></i>{{ busy === 'connect' ? '连接中…' : '连接并打开' }}</button>
      <AppDialog :open="!!dialog" :title="dialog === 'disconnect' ? '确认断开此共享？' : dialog === 'forget' ? '确认忘记应用凭据？' : '操作未完成'" @close="dialog = null">
    <p v-if="dialog === 'error'">{{ error }}</p>
    <template v-else><p>{{ dialog === 'disconnect' ? '可能影响其他程序对同一共享的访问；有文件正在使用时不会强制断开。保存的凭据将保留。' : '只删除本应用保存的密码，不断开当前连接，也不删除 Windows 凭据管理器中的记录。' }}</p><code>{{ dialog === 'disconnect' ? config.sharePath : savedSharePath }}</code></template>
    <template #actions><button class="secondary-button" autofocus @click="dialog = null">{{ dialog === 'error' ? '关闭' : '取消' }}</button><button v-if="dialog !== 'error'" class="primary-button confirm-action" @click="confirmAction">{{ dialog === 'disconnect' ? '确认断开' : '确认忘记' }}</button></template>
      </AppDialog>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.target-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.credentials, .field { display: grid; gap: 14px; min-width: 0; }
.field { gap: 7px; }
.technical-text, code { font-family: ui-monospace, Consolas, monospace; font-variant-ligatures: none; }
code { overflow-wrap: anywhere; font-size: 12px; }
.required-mark, .field-error, .error-detail { color: var(--danger); }
.field-error { font-size: 12px; margin: 8px 0 0; }
.auth-options { display: flex; gap: 8px; }
.auth-options button { flex: 1; padding: 9px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-subtle); color: var(--muted); cursor: pointer; }
.auth-options button.selected { color: var(--accent-strong); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.saved-label { font-size: 11px; color: var(--accent-strong); margin-left: 5px; }
.password-field { display: flex; gap: 6px; align-items: center; }
.password-field input { flex: 1; min-width: 0; }
.muted-note { color: var(--muted); font-size: 12px; line-height: 1.7; margin: 0; }
.privacy-note { border-top: 1px solid var(--border); padding-top: 12px; }
.privacy-note i { color: var(--accent-strong); }
.status-summary { display: flex; gap: 12px; align-items: flex-start; }
.status-summary > i { font-size: 26px; color: var(--muted); }
.status-summary.connected > i { color: var(--success); }
.status-summary strong { font-size: 20px; }
.status-summary p { color: var(--muted); font-size: 12px; margin: 6px 0 0; line-height: 1.7; }
.target-summary { border-block: 1px solid var(--border); padding: 12px 0; display: grid; gap: 6px; }
.target-summary > span { font-size: 12px; color: var(--muted); }
.status-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.text-action { border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; padding: 8px 0; }
.error-detail { color: var(--danger); }
.session-details { font-size: 12px; color: var(--muted); }
.session-details summary { cursor: pointer; }
.session-details ul { padding-left: 16px; margin: 10px 0 0; }
.session-details li { margin: 8px 0; }
.session-details li span { display: block; margin-top: 4px; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 900px) { .target-fields { grid-template-columns: 1fr; } }
</style>
