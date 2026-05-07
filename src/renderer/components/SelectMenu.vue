<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, type PropType } from "vue";

export interface SelectOption {
  label: string;
  value: string;
  icon?: string;
}

export default defineComponent({
  name: "SelectMenu",
  props: {
    modelValue: {
      type: String,
      required: true
    },
    options: {
      type: Array as PropType<SelectOption[]>,
      required: true
    },
    label: {
      type: String,
      default: undefined
    }
  },
  emits: {
    "update:modelValue": (value: string) => typeof value === "string"
  },
  setup(props, { emit }) {
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

    return {
      choose,
      open,
      root,
      selected
    };
  }
});
</script>

<template>
  <div ref="root" class="select-menu">
    <span v-if="label" class="select-label">{{ label }}</span>
    <button type="button" class="select-trigger" :aria-expanded="open" @click.stop="open = !open">
      <span class="select-value">
        <i v-if="selected?.icon" :class="selected.icon" aria-hidden="true"></i>
        <span>{{ selected?.label }}</span>
      </span>
      <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="select-popover" role="listbox" @pointerdown.stop @click.stop>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="select-option"
        :class="{ selected: option.value === modelValue }"
        role="option"
        :aria-selected="option.value === modelValue"
        @click.stop="choose(option.value)"
      >
        <i v-if="option.icon" :class="option.icon" aria-hidden="true"></i>
        <span>{{ option.label }}</span>
        <i v-if="option.value === modelValue" class="ri-check-line check-icon" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>
