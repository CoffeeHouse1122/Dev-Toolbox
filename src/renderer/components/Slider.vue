<script setup lang="ts">
import { motion } from "motion-v";
import { computed, ref } from "vue";

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

const trackRef = ref<HTMLElement | null>(null);

const numericMin = computed(() => Number(props.min));
const numericMax = computed(() => Number(props.max));
const numericStep = computed(() => Math.max(Number(props.step) || 1, 0.000001));
const progress = computed(() => {
  const span = numericMax.value - numericMin.value;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.min(100, Math.max(0, ((props.modelValue - numericMin.value) / span) * 100));
});
const displayValue = computed(() => `${props.modelValue}${props.unit}`);

function clamp(value: number) {
  return Math.min(numericMax.value, Math.max(numericMin.value, value));
}

function decimals(value: number) {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function snap(value: number) {
  const step = numericStep.value;
  const snapped = numericMin.value + Math.round((value - numericMin.value) / step) * step;
  return Number(clamp(snapped).toFixed(decimals(step)));
}

function updateFromClientX(clientX: number) {
  const rect = trackRef.value?.getBoundingClientRect();
  if (!rect || props.disabled) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  emit("update:modelValue", snap(numericMin.value + ratio * (numericMax.value - numericMin.value)));
}

function startDrag(event: PointerEvent) {
  if (props.disabled) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  updateFromClientX(event.clientX);
}

function moveDrag(event: PointerEvent) {
  if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
  updateFromClientX(event.clientX);
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  const step = numericStep.value;
  const largeStep = step * 10;
  const keyMap: Record<string, number> = {
    ArrowLeft: -step,
    ArrowDown: -step,
    ArrowRight: step,
    ArrowUp: step,
    PageDown: -largeStep,
    PageUp: largeStep
  };

  if (event.key === "Home") {
    event.preventDefault();
    emit("update:modelValue", numericMin.value);
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    emit("update:modelValue", numericMax.value);
    return;
  }
  if (event.key in keyMap) {
    event.preventDefault();
    emit("update:modelValue", snap(props.modelValue + keyMap[event.key]));
  }
}
</script>

<template>
  <div
    ref="trackRef"
    class="slider-control"
    :class="{ disabled }"
    role="slider"
    :tabindex="disabled ? -1 : 0"
    :aria-label="ariaLabel"
    :aria-valuemin="numericMin"
    :aria-valuemax="numericMax"
    :aria-valuenow="modelValue"
    :aria-valuetext="displayValue"
    :aria-disabled="disabled"
    @pointerdown="startDrag"
    @pointermove="moveDrag"
    @keydown="handleKeydown"
  >
    <div class="slider-track" aria-hidden="true">
      <motion.div class="slider-fill" :animate="{ width: `${progress}%` }" :transition="{ duration: 0.18 }" />
      <motion.span class="slider-thumb" :animate="{ left: `${progress}%` }" :transition="{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }" />
    </div>
    <motion.strong class="slider-value" :animate="{ scale: disabled ? 0.96 : 1 }" :transition="{ duration: 0.16 }">{{ displayValue }}</motion.strong>
  </div>
</template>