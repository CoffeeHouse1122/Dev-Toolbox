<script setup lang="ts">
import { motion } from "motion-v";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel?: string;
}>(), {
  label: "",
  disabled: false,
  compact: false,
  ariaLabel: ""
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

function toggle() {
  if (props.disabled) return;
  emit("update:modelValue", !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    class="checkbox-control"
    :class="{ checked: modelValue, disabled, compact }"
    role="checkbox"
    :aria-checked="modelValue"
    :aria-label="ariaLabel || label"
    :disabled="disabled"
    @click="toggle"
  >
    <motion.span class="checkbox-box" :animate="{ scale: modelValue ? 1 : 0.96 }" :transition="{ type: 'spring', stiffness: 520, damping: 32, mass: 0.6 }">
      <i v-if="modelValue" class="ri-check-line" aria-hidden="true"></i>
    </motion.span>
    <span v-if="label || $slots.default" class="checkbox-label">
      <slot>{{ label }}</slot>
    </span>
  </button>
</template>