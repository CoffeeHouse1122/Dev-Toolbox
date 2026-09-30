<script setup lang="ts">
import { computed } from "vue";
import { useToolName } from "../composables/useToolName";

const props = defineProps<{ toolId: string }>();
const toolName = useToolName();
const title = computed(() => toolName(props.toolId));
</script>

<template>
  <h2 :data-tool-id="toolId">{{ title }}</h2>
</template>
