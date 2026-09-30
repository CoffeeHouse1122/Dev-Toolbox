<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { OutputDirectoryCheck } from "../../shared/types";
import { clearWorkspaceToast, reportWorkspaceError, showWorkspaceToast } from "../composables/useWorkspaceToast";

type OutputPickerEntry = {
  selectedPath?: string;
  lastOpenedPath?: string;
  dismissedMissingPath?: string;
};

type OutputPickerConfig = Record<string, OutputPickerEntry>;

const props = defineProps<{
  modelValue: string;
  storageKey?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [path: string];
}>();

const route = useRoute();
// KeepAlive pages must keep their own storage key when the global route changes.
const initialRoutePath = route.path;
const configLoaded = ref(false);
const entryState = ref<OutputPickerEntry>({});
let toastId: number | undefined;
let active = true;
const isPickingDir = ref(false);
const isOpeningDir = ref(false);
const pendingAuthorization = ref("");
let selectionRevision = 0;
const persistenceKey = computed(() => (props.storageKey?.trim() || initialRoutePath || "default-output").replace(/\s+/g, "-"));

function clearWarning() {
  if (toastId !== undefined) clearWorkspaceToast(toastId);
  toastId = undefined;
}

function notifyDirectory(message: string, path: string, missing = false, needsAuthorization = false) {
  if (!active) return;
  clearWarning();
  toastId = showWorkspaceToast(`${message}${path ? `\n${path}` : ""}`, needsAuthorization ? "info" : "error", 8000, {
    action: { label: needsAuthorization ? "确认目录" : "重新选择", run: pickDir },
    onDismiss: missing ? async () => {
      if (active) await saveEntry({ ...entryState.value, dismissedMissingPath: path });
    } : undefined
  });
}

function notifyCheck(result: OutputDirectoryCheck, path: string) {
  if (result.status === "needs-authorization") {
    pendingAuthorization.value = path;
    notifyDirectory(result.message || "上次保存的输出目录需要重新授权，请确认目录后使用。", path, false, true);
  } else if (result.status === "missing") {
    if (entryState.value.dismissedMissingPath !== path) notifyDirectory("输出目录不存在或所在磁盘未连接，请检查后重新选择；关闭提示可忽略此提醒。", path, true);
  } else if (result.status === "unavailable") {
    notifyDirectory(result.message || "暂时无法访问输出目录，请检查系统权限、磁盘或网络连接。", path);
  }
}

async function loadConfig() {
  const saved = await window.devToolbox.loadToolConfig("output-picker") as OutputPickerConfig | null;
  return saved && typeof saved === "object" ? saved : {};
}

async function saveEntry(nextEntry: OutputPickerEntry) {
  const key = persistenceKey.value;
  const saved = await loadConfig();
  saved[key] = nextEntry;
  entryState.value = nextEntry;
  configLoaded.value = true;
  await window.devToolbox.saveToolConfig("output-picker", saved);
}

async function restoreEntry() {
  const key = persistenceKey.value;
  const revision = selectionRevision;
  const saved = await loadConfig();
  if (!active || key !== persistenceKey.value || revision !== selectionRevision) return;
  const entry = saved[key] ?? {};
  entryState.value = entry;
  configLoaded.value = true;

  if (!props.modelValue && entry.selectedPath) {
    const result = await window.devToolbox.checkOutputDirectory(entry.selectedPath);
    if (!active || key !== persistenceKey.value || revision !== selectionRevision || props.modelValue) return;
    if (result.status === "ready") {
      pendingAuthorization.value = "";
      emit("update:modelValue", entry.selectedPath);
      return;
    }
    notifyCheck(result, entry.selectedPath);
    return;
  }

  if (!props.modelValue && entry.lastOpenedPath) {
    const result = await window.devToolbox.checkOutputDirectory(entry.lastOpenedPath);
    if (active && key === persistenceKey.value && revision === selectionRevision && !props.modelValue) notifyCheck(result, entry.lastOpenedPath);
  }
}

async function pickDir() {
  if (isPickingDir.value) return;
  selectionRevision++;
  isPickingDir.value = true;
  try {
    const dir = await window.devToolbox.selectOutputDir(props.modelValue || pendingAuthorization.value || entryState.value.selectedPath || entryState.value.lastOpenedPath);
    if (!dir || !active) return;
    pendingAuthorization.value = "";
    emit("update:modelValue", dir);
    clearWarning();
    await saveEntry({ ...entryState.value, selectedPath: dir, dismissedMissingPath: "" });
  } catch (cause) {
    if (active) reportWorkspaceError(cause, "选择输出目录失败");
  } finally {
    isPickingDir.value = false;
  }
}

async function openDir() {
  const currentPath = props.modelValue.trim();
  if (!currentPath || isOpeningDir.value) return;
  isOpeningDir.value = true;
  try {
    const result = await window.devToolbox.openDirectory(currentPath);
    if (result.status === "opened") {
      clearWarning();
      await saveEntry({ ...entryState.value, selectedPath: currentPath, lastOpenedPath: currentPath, dismissedMissingPath: "" });
      return;
    }
    if (result.status === "blocked") {
      notifyDirectory(result.message || "一次只允许打开一个本地文件夹，请稍后再试。", currentPath);
      return;
    }
    // A directory that became unusable must not remain a runnable output target.
    emit("update:modelValue", "");
    notifyCheck({ status: result.status, message: result.message }, currentPath);
  } catch (cause) {
    if (active) reportWorkspaceError(cause, "打开输出目录失败");
  } finally {
    isOpeningDir.value = false;
  }
}

watch(
  () => props.modelValue,
  async (value) => {
    if (!configLoaded.value || !value || isPickingDir.value) return;
    try { await saveEntry({ ...entryState.value, selectedPath: value, dismissedMissingPath: "" }); }
    catch (cause) { if (active) reportWorkspaceError(cause, "保存输出目录失败"); }
  }
);

onMounted(() => {
  void restoreEntry().catch(cause => { if (active) reportWorkspaceError(cause, "读取输出目录失败"); });
});
onActivated(() => { active = true; });
onDeactivated(() => { active = false; clearWarning(); });
onBeforeUnmount(() => { active = false; clearWarning(); });
</script>

<template>
  <div class="output-picker-stack">
    <div class="field-row output-picker">
      <label class="field grow">
        <span>{{ pendingAuthorization && !modelValue ? "输出目录 · 待确认授权" : "输出目录" }}</span>
        <input :value="modelValue || pendingAuthorization" readonly placeholder="请选择输出目录" />
      </label>
      <div class="output-picker-actions">
        <button type="button" class="icon-button" title="打开输出目录" :disabled="!modelValue || isOpeningDir || isPickingDir" @click="openDir">
          <i class="ri-folder-5-line" aria-hidden="true"></i>
        </button>
        <button type="button" class="icon-button" title="选择输出目录" :disabled="isPickingDir || isOpeningDir" @click="pickDir">
          <i class="ri-folder-open-line" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
</template>
