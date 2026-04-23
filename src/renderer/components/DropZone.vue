<script setup lang="ts">
import { computed, ref } from "vue";
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

const fileNames = computed(() => props.modelValue.map((item) => item.split(/[\\/]/).pop()).join(", "));
const previewUrl = computed(() => {
  const first = props.modelValue[0];
  if (!first || !props.preview) return "";
  return encodeURI(`file:///${first.replace(/\\/g, "/")}`);
});

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
  const paths = files.map((file) => (file as File & { path?: string }).path).filter(Boolean) as string[];
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
      <video v-else class="drop-preview-media" :src="previewUrl" muted preload="metadata" playsinline />
    </div>
    <span v-else class="drop-icon"><i class="ri-upload-cloud-2-line" aria-hidden="true"></i></span>
    <span class="drop-title">{{ title }}</span>
    <span class="drop-files">{{ fileNames || "未选择文件" }}</span>
  </div>
</template>
