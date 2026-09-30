<script setup lang="ts">
import { computed, ref } from "vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

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
  <TaskFlowLayout
    tool-id="regex-tester"
    description="实时查看匹配结果、索引和捕获组"
    source-title="测试文本"
    source-description="编辑样本文本后，右侧匹配列表会即时同步"
    settings-title="匹配规则"
    settings-description="填写不包含首尾斜杠的表达式与 JavaScript Flags"
    :file-label="`${text.length} 字符`"
  >
    <template #source-actions>
      <span class="status-pill" :class="state.ok ? 'success' : 'error'">{{ state.ok ? "VALID" : "ERROR" }}</span>
    </template>

    <template #source>
      <textarea v-model="text" class="tool-textarea code-output regex-source-input" aria-label="正则测试文本"></textarea>
    </template>

    <template #settings>
      <div class="regex-settings">
        <label class="field">
          <span>表达式</span>
          <input v-model="pattern" class="code-output" placeholder="输入正则表达式，不包含 / /" />
        </label>
        <label class="field regex-flags-field">
          <span>Flags</span>
          <input v-model="flags" class="code-output" placeholder="gimuy" />
        </label>
        <p class="regex-rule-preview" :class="{ invalid: !state.ok }">
          <span>当前规则</span>
          <strong>/{{ pattern }}/{{ flags }}</strong>
        </p>
      </div>
    </template>

    <template #result>
      <aside class="result-panel">
        <div class="section-title">
          <h2>匹配结果</h2>
          <span class="status-pill">{{ state.matches.length }}</span>
        </div>
        <div class="regex-result-body">
          <p v-if="!state.ok" class="error-text">{{ state.error }}</p>
          <div v-else-if="state.matches.length" class="match-list">
            <article v-for="(match, index) in state.matches" :key="`${match.index}-${index}`" class="match-item">
              <strong>{{ match.value }}</strong>
              <span>index: {{ match.index }}</span>
              <small v-if="match.groups.length">捕获组：{{ match.groups.join(" / ") }}</small>
            </article>
          </div>
          <p v-else class="empty-state">暂无匹配</p>
        </div>
      </aside>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.regex-source-input {
  min-height: 126px;
  max-height: 190px;
  resize: vertical;
}

.regex-settings {
  display: grid;
  gap: 14px;
  align-content: start;
}

.regex-flags-field {
  max-width: 180px;
}

.regex-rule-preview {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.regex-rule-preview span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.regex-rule-preview strong {
  overflow-wrap: anywhere;
  color: var(--accent-strong);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}

.regex-rule-preview.invalid strong {
  color: var(--danger);
}

.regex-result-body {
  min-height: 0;
  overflow: auto;
}

.regex-result-body > .empty-state {
  display: grid;
  place-items: center;
  min-height: 100%;
  margin: 0;
}

.error-text {
  overflow-wrap: anywhere;
}
</style>
