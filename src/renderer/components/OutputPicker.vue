<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

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
const configLoaded = ref(false);
const entryState = ref<OutputPickerEntry>({});
const warningPath = ref("");
const warningMessage = ref("");
const isPickingDir = ref(false);
const isOpeningDir = ref(false);
const persistenceKey = computed(() => (props.storageKey?.trim() || route.path || "default-output").replace(/\s+/g, "-"));
const pickerEnter = { opacity: 0, y: 6 };
const pickerVisible = { opacity: 1, y: 0 };
const pickerHover = { y: -1 };
const warningEnter = { opacity: 0, y: -6, scale: 0.985 };
const warningVisible = { opacity: 1, y: 0, scale: 1 };
const warningExit = { opacity: 0, y: -4, scale: 0.985 };

function clearWarning() {
  warningPath.value = "";
  warningMessage.value = "";
}

async function loadConfig() {
  const saved = await window.devToolbox.loadToolConfig("output-picker") as OutputPickerConfig | null;
  return saved && typeof saved === "object" ? saved : {};
}

async function saveEntry(nextEntry: OutputPickerEntry) {
  const saved = await loadConfig();
  saved[persistenceKey.value] = nextEntry;
  entryState.value = nextEntry;
  configLoaded.value = true;
  await window.devToolbox.saveToolConfig("output-picker", saved);
}

async function restoreEntry() {
  const saved = await loadConfig();
  const entry = saved[persistenceKey.value] ?? {};
  entryState.value = entry;
  configLoaded.value = true;

  if (!props.modelValue && entry.selectedPath) {
    if (await window.devToolbox.pathExists(entry.selectedPath)) {
      emit("update:modelValue", entry.selectedPath);
      return;
    }
    if (entry.dismissedMissingPath !== entry.selectedPath) {
      warningPath.value = entry.selectedPath;
      warningMessage.value = "上次保存的输出目录已不存在，可重新选择或忽略此提醒。";
    }
    return;
  }

  if (entry.lastOpenedPath && !(await window.devToolbox.pathExists(entry.lastOpenedPath)) && entry.dismissedMissingPath !== entry.lastOpenedPath) {
    warningPath.value = entry.lastOpenedPath;
    warningMessage.value = "上次打开的输出目录已不存在，可重新选择或忽略此提醒。";
  }
}

async function dismissWarning() {
  await saveEntry({ ...entryState.value, dismissedMissingPath: warningPath.value || entryState.value.dismissedMissingPath });
  clearWarning();
}

async function pickDir() {
  if (isPickingDir.value) return;
  isPickingDir.value = true;
  try {
    const dir = await window.devToolbox.selectOutputDir(props.modelValue || entryState.value.lastOpenedPath || entryState.value.selectedPath);
    if (!dir) return;
    emit("update:modelValue", dir);
    clearWarning();
    await saveEntry({ ...entryState.value, selectedPath: dir, dismissedMissingPath: "" });
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
      warningPath.value = currentPath;
      warningMessage.value = result.message || "一次只允许打开一个本地文件夹，请稍后再试。";
      return;
    }
    if (result.status === "missing") {
      warningPath.value = currentPath;
      warningMessage.value = "当前输出目录已不存在，可重新选择或忽略此提醒。";
    }
  } finally {
    isOpeningDir.value = false;
  }
}

watch(
  () => props.modelValue,
  async (value) => {
    if (!configLoaded.value || !value) return;
    await saveEntry({ ...entryState.value, selectedPath: value, dismissedMissingPath: "" });
  }
);

onMounted(() => {
  void restoreEntry();
});
</script>

<template>
  <motion.div class="output-picker-stack" :initial="pickerEnter" :animate="pickerVisible" :whileHover="pickerHover" :transition="{ duration: 0.16 }">
    <div class="field-row output-picker">
      <label class="field grow">
        <span>输出目录</span>
        <input :value="modelValue" readonly placeholder="请选择输出目录" />
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
    <AnimatePresence>
      <motion.div
        v-if="warningMessage"
        key="output-warning"
        class="output-picker-warning"
        :initial="warningEnter"
        :animate="warningVisible"
        :exit="warningExit"
        :transition="{ duration: 0.16 }"
      >
        <div>
          <strong>目录提醒</strong>
          <p>{{ warningMessage }}</p>
          <small v-if="warningPath">{{ warningPath }}</small>
        </div>
        <div class="output-picker-warning-actions">
          <button type="button" class="secondary-button" @click="pickDir">重新选择</button>
          <button type="button" class="icon-button" title="忽略提醒" @click="dismissWarning">
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  </motion.div>
</template>
