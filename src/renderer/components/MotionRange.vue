<script setup lang="ts">
import { motion } from "motion-v";
import { computed } from "vue";

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  disabled?: boolean;
  unit?: string;
  ariaLabel?: string;
}>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  unit: "",
  ariaLabel: ""
});

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const numericMin = computed(() => Number(props.min));
const numericMax = computed(() => Number(props.max));
const progress = computed(() => {
  const span = numericMax.value - numericMin.value;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.min(100, Math.max(0, ((props.modelValue - numericMin.value) / span) * 100));
});
const displayValue = computed(() => `${props.modelValue}${props.unit}`);

function updateValue(event: Event) {
  emit("update:modelValue", Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="motion-range" :class="{ disabled }">
    <div class="motion-range-track" aria-hidden="true">
      <motion.div class="motion-range-fill" :animate="{ width: `${progress}%` }" :transition="{ duration: 0.18 }" />
      <motion.span class="motion-range-thumb-ghost" :animate="{ left: `${progress}%` }" :transition="{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }" />
    </div>
    <input
      class="motion-range-input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @input="updateValue"
    />
    <motion.strong class="motion-range-value" :animate="{ scale: disabled ? 0.96 : 1 }" :transition="{ duration: 0.16 }">{{ displayValue }}</motion.strong>
  </div>
</template>