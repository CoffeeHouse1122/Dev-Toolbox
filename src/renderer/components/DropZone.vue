<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { DialogFileFilter } from "../../shared/types";

const props = defineProps<{
  modelValue: string[];
  filters?: DialogFileFilter[];
  multiple?: boolean;
  title: string;
  preview?: "image" | "video";
  compact?: boolean;
  appendSelection?: boolean;
  actionLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [paths: string[]];
}>();

const isDragging = ref(false);
const previewUrl = ref("");
const previewVideoRef = ref<HTMLVideoElement | null>(null);
let previewRequestId = 0;

function extensionOf(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function acceptsPath(filePath: string) {
  const extensions = props.filters?.flatMap((filter) => filter.extensions).map((item) => item.replace(/^\./, "").toLowerCase()) ?? [];
  return !extensions.length || extensions.includes("*") || extensions.includes(extensionOf(filePath));
}

function uniquePaths(paths: string[]) {
  const seen = new Set<string>();
  return paths.filter((item) => {
    const key = item.normalize("NFC").toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function previewFileUrl(filePath: string, time = 0.1) {
  const params = new URLSearchParams({ path: filePath, cache: "1" });
  return `devtoolbox-file://preview?${params.toString()}#t=${time}`;
}

function releasePreviewVideo() {
  const video = previewVideoRef.value;
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
}

const fileNames = computed(() => props.modelValue.map((item) => item.split(/[\\/]/).pop()).join(", "));
const selectionLabel = computed(() => {
  if (props.modelValue.length === 0) return "未选择文件";
  if (props.modelValue.length === 1) return fileNames.value;
  return `已选择 ${props.modelValue.length} 个文件`;
});
watch(
  () => [props.modelValue[0], props.preview] as const,
  async ([first, preview]) => {
    const requestId = ++previewRequestId;
    releasePreviewVideo();
    previewUrl.value = "";
    if (!first || !preview) return;
    if (preview === "video") {
      previewUrl.value = previewFileUrl(first);
      return;
    }

    try {
      const image = await window.devToolbox.imageToBase64(first);
      if (requestId === previewRequestId) previewUrl.value = image.dataUrl;
    } catch {
      if (requestId === previewRequestId) previewUrl.value = "";
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  releasePreviewVideo();
});

async function pickFiles() {
  const paths = await window.devToolbox.selectFiles(props.filters, props.multiple ?? true);
  if (paths.length > 0) {
    const nextPaths = props.appendSelection ? uniquePaths([...props.modelValue, ...paths]) : paths;
    emit("update:modelValue", props.multiple === false ? [nextPaths[0]] : nextPaths);
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  const paths = window.devToolbox.getDroppedFilePaths(files).filter(acceptsPath);
  if (paths.length > 0) {
    emit("update:modelValue", props.multiple === false ? [paths[0]] : uniquePaths([...props.modelValue, ...paths]));
  }
}

function removeFile(index: number) {
  emit("update:modelValue", props.modelValue.filter((_item, itemIndex) => itemIndex !== index));
}

function moveFile(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= props.modelValue.length) return;
  const paths = [...props.modelValue];
  [paths[index], paths[target]] = [paths[target], paths[index]];
  emit("update:modelValue", paths);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void pickFiles();
  }
}
</script>

<template>
  <div class="drop-zone-wrapper" :class="{ compact }">
    <div
      class="drop-zone"
      :class="{ active: isDragging, compact, 'has-preview': Boolean(previewUrl) }"
      role="button"
      tabindex="0"
      @click="pickFiles"
      @keydown="onKeydown"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop="onDrop"
    >
      <div v-if="previewUrl" class="drop-preview">
        <img v-if="preview === 'image'" class="drop-preview-media" :src="previewUrl" alt="图片预览" />
        <video ref="previewVideoRef" v-else class="drop-preview-media" :key="previewUrl" :src="previewUrl" muted preload="metadata" playsinline />
      </div>
      <span v-else class="drop-icon"><i class="ri-upload-cloud-2-line" aria-hidden="true"></i></span>
      <span class="drop-title">{{ title }}</span>
      <span class="drop-files" :title="fileNames">{{ selectionLabel }}</span>
      <span v-if="compact" class="drop-add-label">
        <i class="ri-add-line" aria-hidden="true"></i>
        {{ actionLabel || "添加文件" }}
      </span>
    </div>
    <ol v-if="modelValue.length" class="drop-file-list" aria-label="已选文件与顺序">
      <li v-for="(filePath, index) in modelValue" :key="filePath" class="drop-file-item">
        <span :title="filePath">{{ index + 1 }}. {{ filePath.split(/[\\/]/).pop() }}</span>
        <span class="drop-file-actions">
          <button v-if="multiple !== false" type="button" class="icon-button" :disabled="index === 0" title="上移" @click="moveFile(index, -1)"><i class="ri-arrow-up-line"></i></button>
          <button v-if="multiple !== false" type="button" class="icon-button" :disabled="index === modelValue.length - 1" title="下移" @click="moveFile(index, 1)"><i class="ri-arrow-down-line"></i></button>
          <button type="button" class="icon-button" title="移除" @click="removeFile(index)"><i class="ri-close-line"></i></button>
        </span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.drop-file-list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  margin: 8px 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.drop-file-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
}

.drop-file-item > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-file-actions {
  display: flex;
  gap: 2px;
}

.drop-zone.compact {
  grid-template-areas:
    "icon title action"
    "icon files action";
  grid-template-columns: auto minmax(0, 1fr) auto;
  justify-items: start;
  align-items: center;
  gap: 3px 12px;
  min-height: 72px;
  padding: 12px;
  text-align: left;
}

.drop-zone.compact .drop-icon {
  grid-area: icon;
  width: 36px;
  height: 36px;
  font-size: 18px;
}

.drop-zone.compact .drop-title {
  grid-area: title;
}

.drop-zone.compact .drop-files {
  grid-area: files;
}

.drop-add-label {
  grid-area: action;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface);
  font-size: 12px;
  font-weight: 700;
}

.drop-zone.compact:hover .drop-add-label,
.drop-zone.compact:focus-visible .drop-add-label {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.drop-zone-wrapper.compact .drop-file-list {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  max-height: 150px;
  margin-top: 10px;
}

.drop-zone-wrapper.compact .drop-file-item {
  min-height: 40px;
  background: var(--surface-subtle);
}

@media (max-width: 720px) {
  .drop-zone.compact {
    grid-template-areas:
      "icon title"
      "icon files"
      "action action";
    grid-template-columns: auto minmax(0, 1fr);
  }

  .drop-add-label {
    justify-content: center;
    width: 100%;
    margin-top: 6px;
  }
}
</style>
