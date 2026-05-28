<script setup lang="ts">
import { motion } from "motion-v";
import { computed, onBeforeUnmount, ref } from "vue";

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
const isDragging = ref(false);
const activePointerId = ref<number | null>(null);

const numericMin = computed(() => Number(props.min));
const numericMax = computed(() => Number(props.max));
const numericStep = computed(() => Math.max(Number(props.step) || 1, 0.000001));
const progress = computed(() => {
  const span = numericMax.value - numericMin.value;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.min(100, Math.max(0, ((props.modelValue - numericMin.value) / span) * 100));
});
const displayValue = computed(() => `${props.modelValue}${props.unit}`);
const motionTransition = computed(() => (isDragging.value ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.7 }));

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
  event.preventDefault();
  isDragging.value = true;
  activePointerId.value = event.pointerId;
  updateFromClientX(event.clientX);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}

function startMouseDrag(event: MouseEvent) {
  if (props.disabled || isDragging.value) return;
  event.preventDefault();
  isDragging.value = true;
  activePointerId.value = null;
  updateFromClientX(event.clientX);
  window.addEventListener("mousemove", moveMouseDrag);
  window.addEventListener("mouseup", endMouseDrag);
}

function moveDrag(event: PointerEvent) {
  if (!isDragging.value || event.pointerId !== activePointerId.value) return;
  event.preventDefault();
  updateFromClientX(event.clientX);
}

function endDrag(event: PointerEvent) {
  if (event.pointerId !== activePointerId.value) return;
  isDragging.value = false;
  activePointerId.value = null;
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
}

function moveMouseDrag(event: MouseEvent) {
  if (!isDragging.value || activePointerId.value !== null) return;
  event.preventDefault();
  updateFromClientX(event.clientX);
}

function endMouseDrag() {
  if (activePointerId.value !== null) return;
  isDragging.value = false;
  window.removeEventListener("mousemove", moveMouseDrag);
  window.removeEventListener("mouseup", endMouseDrag);
}

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  window.removeEventListener("mousemove", moveMouseDrag);
  window.removeEventListener("mouseup", endMouseDrag);
});

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
    @keydown="handleKeydown"
  >
    <div ref="trackRef" class="slider-track" aria-hidden="true" @pointerdown="startDrag" @mousedown="startMouseDrag">
      <motion.div class="slider-fill" :animate="{ width: `${progress}%` }" :transition="motionTransition" />
      <motion.span class="slider-thumb" :animate="{ left: `${progress}%` }" :transition="motionTransition" />
    </div>
    <motion.strong class="slider-value" :animate="{ scale: disabled ? 0.96 : 1 }" :transition="{ duration: 0.16 }">{{ displayValue }}</motion.strong>
  </div>
</template>