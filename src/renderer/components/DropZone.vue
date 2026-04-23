<script setup lang="ts">
import { computed, ref } from "vue";
import type { DialogFileFilter } from "../../shared/types";

const props = defineProps<{
  modelValue: string[];
  filters?: DialogFileFilter[];
  multiple?: boolean;
  title: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [paths: string[]];
}>();

const isDragging = ref(false);

const fileNames = computed(() => props.modelValue.map((item) => item.split(/[\\/]/).pop()).join(", "));

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
</script>

<template>
  <button
    type="button"
    class="drop-zone"
    :class="{ active: isDragging }"
    @click="pickFiles"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop="onDrop"
  >
    <span class="drop-icon"><i class="ri-upload-cloud-2-line" aria-hidden="true"></i></span>
    <span class="drop-title">{{ title }}</span>
    <span class="drop-files">{{ fileNames || "No file selected" }}</span>
  </button>
</template>
