<script setup lang="ts">
import { gsap } from "gsap";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

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

const boxRef = ref<HTMLElement | null>(null);

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

watch(() => props.modelValue, (checked) => {
  if (!boxRef.value) return;
  if (prefersReducedMotion()) {
    gsap.set(boxRef.value, { scale: checked ? 1 : 0.96 });
    return;
  }
  gsap.to(boxRef.value, {
    scale: checked ? 1 : 0.96,
    duration: 0.2,
    ease: "back.out(2.2)",
    overwrite: true
  });
});

onMounted(() => {
  if (boxRef.value) gsap.set(boxRef.value, { scale: props.modelValue ? 1 : 0.96 });
});

onBeforeUnmount(() => {
  if (boxRef.value) gsap.killTweensOf(boxRef.value);
});

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
    <span ref="boxRef" class="checkbox-box">
      <i v-if="modelValue" class="ri-check-line" aria-hidden="true"></i>
    </span>
    <span v-if="label || $slots.default" class="checkbox-label">
      <slot>{{ label }}</slot>
    </span>
  </button>
</template>
