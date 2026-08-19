<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import type { ToolSuite } from "../config/toolSuites";

defineProps<{
  suite: ToolSuite;
}>();

const route = useRoute();

function isCurrentPath(path: string) {
  return route.path === path;
}
</script>

<template>
  <nav class="tool-suite-tabs" :aria-label="`${suite.label}模式`">
    <span class="tool-suite-tabs__identity" aria-hidden="true">
      <i :class="suite.icon"></i>
      <span>{{ suite.label }}</span>
    </span>
    <span class="tool-suite-tabs__divider" aria-hidden="true"></span>
    <div class="tool-suite-tabs__rail">
      <RouterLink
        v-for="(tab, index) in suite.tabs"
        :key="tab.path"
        :to="tab.path"
        class="tool-suite-tabs__tab"
        :class="{ 'is-current': isCurrentPath(tab.path) }"
        :aria-current="isCurrentPath(tab.path) ? 'page' : undefined"
        :aria-label="`切换到${tab.label}`"
      >
        <span class="tool-suite-tabs__index" aria-hidden="true">{{ String(index + 1).padStart(2, "0") }}</span>
        <i :class="tab.icon" aria-hidden="true"></i>
        <span>{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.tool-suite-tabs {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 4px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface));
  color: var(--text);
  font-family: var(--font-ui);
  scrollbar-width: thin;
}

.tool-suite-tabs__identity,
.tool-suite-tabs__tab {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.tool-suite-tabs__identity {
  gap: 7px;
  min-height: 30px;
  padding: 0 10px 0 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.tool-suite-tabs__identity i {
  color: var(--accent-strong);
  font-size: 16px;
}

.tool-suite-tabs__divider {
  flex: 0 0 1px;
  align-self: stretch;
  margin: 3px 4px;
  background: var(--border);
}

.tool-suite-tabs__rail {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: max-content;
}

.tool-suite-tabs__tab {
  position: relative;
  gap: 7px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
}

.tool-suite-tabs__tab:hover {
  border-color: var(--border);
  background: var(--surface);
  color: var(--text);
}

.tool-suite-tabs__tab.is-current {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: var(--surface);
  box-shadow: inset 2px 0 0 var(--accent);
  color: var(--accent-strong);
}

.tool-suite-tabs__tab:focus-visible {
  z-index: 1;
  outline: 2px solid color-mix(in srgb, var(--accent) 64%, transparent);
  outline-offset: -2px;
}

.tool-suite-tabs__index {
  color: color-mix(in srgb, var(--muted) 72%, transparent);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.tool-suite-tabs__tab.is-current .tool-suite-tabs__index {
  color: var(--accent-strong);
}

@media (max-width: 720px) {
  .tool-suite-tabs__identity span {
    display: none;
  }

  .tool-suite-tabs__identity {
    padding-inline: 7px;
  }
}
</style>
