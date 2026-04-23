<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export interface SelectOption {
  label: string;
  value: string;
  icon?: string;
}

const props = defineProps<{
  modelValue: string;
  options: SelectOption[];
  label?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const selected = computed(() => props.options.find((option) => option.value === props.modelValue) ?? props.options[0]);

function choose(value: string) {
  emit("update:modelValue", value);
  open.value = false;
}

function onPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="root" class="select-menu">
    <span v-if="label" class="select-label">{{ label }}</span>
    <button type="button" class="select-trigger" :aria-expanded="open" @click="open = !open">
      <span class="select-value">
        <i v-if="selected?.icon" :class="selected.icon" aria-hidden="true"></i>
        <span>{{ selected?.label }}</span>
      </span>
      <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="select-popover" role="listbox">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="select-option"
        :class="{ selected: option.value === modelValue }"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="choose(option.value)"
      >
        <i v-if="option.icon" :class="option.icon" aria-hidden="true"></i>
        <span>{{ option.label }}</span>
        <i v-if="option.value === modelValue" class="ri-check-line check-icon" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>

