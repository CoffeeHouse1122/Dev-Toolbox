<script setup lang="ts">
import { computed, ref } from "vue";

const pattern = ref("\\b[A-Z][a-z]+\\b");
const flags = ref("g");
const text = ref("Hello Dev Toolbox\nRegex Tester");

const state = computed(() => {
  try {
    const regex = new RegExp(pattern.value, flags.value);
    const matches: { value: string; index: number; groups: string[] }[] = [];
    if (regex.global) {
      for (const match of text.value.matchAll(regex)) {
        matches.push({ value: match[0], index: match.index, groups: match.slice(1) });
      }
    } else {
      const match = regex.exec(text.value);
      if (match) matches.push({ value: match[0], index: match.index, groups: match.slice(1) });
    }
    return { ok: true, matches, error: "" };
  } catch (error) {
    return { ok: false, matches: [], error: error instanceof Error ? error.message : String(error) };
  }
});
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>正则测试器</h2>
        <p>实时查看匹配结果、索引和捕获组</p>
      </div>
      <span class="status-pill" :class="state.ok ? 'success' : 'error'">{{ state.ok ? "VALID" : "ERROR" }}</span>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="option-grid">
          <label class="field span-2">
            <span>表达式</span>
            <input v-model="pattern" placeholder="输入正则表达式，不包含 / /" />
          </label>
          <label class="field span-2">
            <span>Flags</span>
            <input v-model="flags" placeholder="gimuy" />
          </label>
        </div>
        <label class="field">
          <span>测试文本</span>
          <textarea v-model="text" class="tool-textarea markdown-editor"></textarea>
        </label>
      </section>

      <aside class="result-panel">
        <div class="section-title">
          <h2>匹配结果</h2>
          <span class="status-pill">{{ state.matches.length }}</span>
        </div>
        <p v-if="!state.ok" class="error-text">{{ state.error }}</p>
        <div v-else-if="state.matches.length" class="match-list">
          <article v-for="(match, index) in state.matches" :key="`${match.index}-${index}`" class="match-item">
            <strong>{{ match.value }}</strong>
            <span>index: {{ match.index }}</span>
            <small v-if="match.groups.length">捕获组：{{ match.groups.join(" / ") }}</small>
          </article>
        </div>
        <p v-else class="empty-state">暂无匹配</p>
      </aside>
    </div>
  </section>
</template>
