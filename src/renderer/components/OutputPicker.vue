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
  <div class="field-row">
    <label class="field grow">
      <span>Output</span>
      <input :value="modelValue" readonly placeholder="Select output directory" />
    </label>
    <button type="button" class="icon-button" title="Select output directory" @click="pickDir">
      <i class="ri-folder-open-line" aria-hidden="true"></i>
    </button>
  </div>
</template>
