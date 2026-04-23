<script setup lang="ts">
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [path: string];
}>();

async function pickDir() {
  const dir = await window.devToolbox.selectOutputDir();
  if (dir) {
    emit("update:modelValue", dir);
  }
}
</script>

<template>
  <div class="field-row output-picker">
    <label class="field grow">
      <span>输出目录</span>
      <input :value="modelValue" readonly placeholder="请选择输出目录" />
    </label>
    <button type="button" class="icon-button" title="选择输出目录" @click="pickDir">
      <i class="ri-folder-open-line" aria-hidden="true"></i>
    </button>
  </div>
</template>
