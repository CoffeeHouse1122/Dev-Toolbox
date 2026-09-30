<script setup lang="ts">
import { onActivated, onMounted, ref } from "vue";
import type { OutputAuthorizationsState } from "../../shared/types";
import AppDialog from "./AppDialog.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const state = ref<OutputAuthorizationsState | null>(null);
const busy = ref(false);
const confirming = ref(false);
async function load() {
  if (busy.value) return;
  busy.value = true;
  try {
    state.value = await window.devToolbox.getOutputAuthorizations();
    if (state.value.warning) showWorkspaceToast(state.value.warning, "info");
  } catch { showWorkspaceToast("目录授权状态读取失败，请稍后重试。", "error"); }
  finally { busy.value = false; }
}
async function clear() {
  if (busy.value) return;
  busy.value = true;
  try {
    state.value = await window.devToolbox.clearOutputAuthorizations();
    confirming.value = false;
    window.dispatchEvent(new Event("output-authorizations-cleared"));
    showWorkspaceToast("目录授权已清除，下次使用请重新选择目录。文件和路径配置未删除。", "success");
  } catch {
    confirming.value = false;
    showWorkspaceToast("目录授权清除失败，请检查本地存储权限后重试。", "error");
  } finally { busy.value = false; }
}
onMounted(load);
onActivated(load);
</script>

<template>
  <div class="settings-block output-authorization-settings">
    <div class="authorization-heading">
      <h3>输出目录授权</h3>
      <button type="button" class="secondary-button authorization-refresh" :disabled="busy" @click="load">刷新</button>
    </div>
    <p>通过系统选择窗口确认的目录会安全记住，重启后校验有效即可继续使用。</p>
    <p v-if="state" class="authorization-summary">已记住 {{ state.rememberedCount }} 个目录 · 仅本次运行 {{ state.sessionCount }} 个</p>
    <button type="button" class="secondary-button authorization-clear" :disabled="busy || !state || (!state.rememberedCount && !state.sessionCount && !state.warning)" @click="confirming = true">清除目录授权</button>
    <AppDialog :open="confirming" title="清除目录授权？" @close="!busy && (confirming = false)">
      <p>清除通过输出目录选择窗口建立的授权。之后需重新选择目录，但不会删除文件、历史记录或保存的路径，也不会终止已开始的任务。</p>
      <p>单独选择的源文件、拖入文件及系统共享登录不受影响。</p>
      <template #actions>
        <button type="button" class="secondary-button authorization-cancel" :disabled="busy" @click="confirming = false">取消</button>
        <button type="button" class="primary-button authorization-confirm" :disabled="busy" @click="clear">{{ busy ? "清除中…" : "确认清除" }}</button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.authorization-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.authorization-heading h3 { margin: 0; }
p { color: var(--muted); font-size: 13px; line-height: 1.7; }
</style>
