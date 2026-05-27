<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DialogFileFilter } from "../../shared/types";

const props = defineProps<{
  modelValue: string[];
  filters?: DialogFileFilter[];
  multiple?: boolean;
  title: string;
  preview?: "image" | "video";
}>();

const emit = defineEmits<{
  "update:modelValue": [paths: string[]];
}>();

const isDragging = ref(false);
const previewUrl = ref("");
let previewRequestId = 0;

function previewFileUrl(filePath: string, time = 0.1) {
  const params = new URLSearchParams({ path: filePath });
  return `devtoolbox-file://preview?${params.toString()}#t=${time}`;
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

async function pickFiles() {
  const paths = await window.devToolbox.selectFiles(props.filters, props.multiple ?? true);
  if (paths.length > 0) {
    emit("update:modelValue", props.multiple === false ? [paths[0]] : paths);
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  const paths = window.devToolbox.getDroppedFilePaths(files);
  if (paths.length > 0) {
    emit("update:modelValue", props.multiple === false ? [paths[0]] : paths);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void pickFiles();
  }
}
</script>

<template>
  <div
    class="drop-zone"
    :class="{ active: isDragging, 'has-preview': Boolean(previewUrl) }"
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
      <video v-else class="drop-preview-media" :key="previewUrl" :src="previewUrl" muted preload="metadata" playsinline />
    </div>
    <span v-else class="drop-icon"><i class="ri-upload-cloud-2-line" aria-hidden="true"></i></span>
    <span class="drop-title">{{ title }}</span>
    <span class="drop-files" :title="fileNames">{{ selectionLabel }}</span>
  </div>
</template>
