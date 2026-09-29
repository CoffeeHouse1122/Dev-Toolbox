<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watchEffect } from "vue";
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
watchEffect(() => {
  if (props.open && !dialog.value?.open) dialog.value?.showModal();
  else if (!props.open && dialog.value?.open) dialog.value.close();
});
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="app-dialog" :aria-labelledby="titleId" @cancel.prevent="emit('close')">
      <h3 :id="titleId">{{ title }}</h3>
      <div class="dialog-content"><slot /></div>
      <footer><slot name="actions" /></footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.app-dialog { position: fixed; inset: 0; margin: auto; width: min(520px, calc(100vw - 40px)); max-height: calc(100vh - 48px); box-sizing: border-box; overflow: auto; padding: 24px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); box-shadow: 0 20px 70px #0005; }
.app-dialog:not([open]) { display: none; }
.app-dialog::backdrop { background: #0008; }
h3 { margin: 0 0 16px; font-size: 17px; }
.dialog-content { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
</style>
