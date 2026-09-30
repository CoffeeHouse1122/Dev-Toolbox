<script setup lang="ts">
import { computed } from "vue";
import { useWorkspaceToast } from "../composables/useWorkspaceToast";
import GsapTransition from "./GsapTransition.vue";

const { toast, dismissToast, runAction } = useWorkspaceToast();
const iconClass = computed(() => {
  if (toast.value.tone === "success") return "ri-checkbox-circle-line";
  if (toast.value.tone === "error") return "ri-error-warning-line";
  return "ri-information-line";
});
</script>

<template>
  <div class="workspace-toast-region" aria-atomic="true">
    <GsapTransition
      :from="{ opacity: 0, y: -10, scale: 0.98 }"
      :to="{ opacity: 1, y: 0, scale: 1 }"
      :leave="{ opacity: 0, y: -6, scale: 0.99 }"
      :duration="0.18"
    >
      <div
        v-if="toast.visible"
        class="workspace-toast"
        :class="toast.tone"
        :role="toast.tone === 'error' ? 'alert' : 'status'"
        :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"
      >
        <i :class="iconClass" aria-hidden="true"></i>
        <span>{{ toast.message }}</span>
        <button v-if="toast.actionLabel" type="button" class="toast-action" @click="runAction">{{ toast.actionLabel }}</button>
        <button type="button" class="toast-close" title="关闭提示" aria-label="关闭提示" @click="dismissToast"><i class="ri-close-line" aria-hidden="true"></i></button>
      </div>
    </GsapTransition>
  </div>
</template>

<style scoped>
.workspace-toast-region {
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: 850;
  width: min(560px, calc(100% - 32px));
  transform: translateX(-50%);
  pointer-events: none;
}

.workspace-toast {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: max-content;
  max-width: 100%;
  min-height: 34px;
  margin: 0 auto;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(1, 4, 9, 0.16);
  color: var(--text);
  font: inherit;
  line-height: 1.35;
  text-align: left;
  pointer-events: auto;
}

.toast-action, .toast-close {
  flex: 0 0 auto;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.toast-action { padding: 6px; color: var(--accent-strong); font: inherit; white-space: nowrap; }
.toast-close { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; }
.toast-action:hover, .toast-close:hover { background: var(--surface-subtle); }
.toast-action:focus-visible, .toast-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.workspace-toast span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.workspace-toast.success {
  border-color: color-mix(in srgb, var(--success) 44%, var(--border));
}

.workspace-toast.success i {
  color: var(--success);
}

.workspace-toast.error {
  border-color: color-mix(in srgb, var(--danger) 48%, var(--border));
}

.workspace-toast.error i {
  color: var(--danger);
}

.workspace-toast.info i {
  color: var(--accent-strong);
}
</style>
