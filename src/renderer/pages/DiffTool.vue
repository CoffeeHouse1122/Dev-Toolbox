<script setup lang="ts">
import { computed, ref } from "vue";

type DiffMode = "unified" | "side-by-side";

const leftText = ref("");
const rightText = ref("");
const mode = ref<DiffMode>("side-by-side");
const contextLines = ref(3);
const maxMatrixCells = 1_000_000;
const maxTextLength = 1_000_000;

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  leftNum?: number;
  rightNum?: number;
  content: string;
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function backtrack(dp: number[][], a: string[], b: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "unchanged", leftNum: i, rightNum: j, content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", rightNum: j, content: b[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", leftNum: i, content: a[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

const diffInput = computed(() => {
  if (leftText.value.length + rightText.value.length > maxTextLength) {
    return { a: [] as string[], b: [] as string[], error: "文本总长度超过 1,000,000 字符，请先缩小对比范围。" };
  }
  const a = leftText.value.split("\n");
  const b = rightText.value.split("\n");
  if (a.length * b.length > maxMatrixCells) {
    return { a, b, error: `当前 ${a.length.toLocaleString()} × ${b.length.toLocaleString()} 行会生成过大的比较矩阵，请拆分文件后再比较。` };
  }
  return { a, b, error: "" };
});

const rawDiff = computed<DiffLine[]>(() => {
  if (!leftText.value && !rightText.value) return [];
  const { a, b, error } = diffInput.value;
  if (error) return [];
  const dp = computeLCS(a, b);
  return backtrack(dp, a, b);
});

const unifiedHunks = computed(() => {
  const ctx = contextLines.value;
  const lines = rawDiff.value;
  const changedIdx = new Set<number>();
  lines.forEach((line, idx) => {
    if (line.type !== "unchanged") changedIdx.add(idx);
  });
  const keep = new Set<number>();
  changedIdx.forEach((idx) => {
    for (let d = -ctx; d <= ctx; d++) {
      const k = idx + d;
      if (k >= 0 && k < lines.length) keep.add(k);
    }
  });
  return lines.filter((_, idx) => keep.has(idx));
});

const sideBySidePairs = computed(() => {
  const pairs: { left?: DiffLine; right?: DiffLine }[] = [];
  const lines = rawDiff.value;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === "unchanged") {
      pairs.push({ left: line, right: line });
      i++;
    } else if (line.type === "removed" && i + 1 < lines.length && lines[i + 1].type === "added") {
      pairs.push({ left: line, right: lines[i + 1] });
      i += 2;
    } else if (line.type === "removed") {
      pairs.push({ left: line, right: undefined });
      i++;
    } else {
      pairs.push({ left: undefined, right: line });
      i++;
    }
  }
  return pairs;
});

const stats = computed(() => {
  let added = 0;
  let removed = 0;
  for (const line of rawDiff.value) {
    if (line.type === "added") added++;
    else if (line.type === "removed") removed++;
  }
  return { added, removed };
});

function clear() {
  leftText.value = "";
  rightText.value = "";
}

function loadSample() {
  leftText.value = [
    "function hello() {",
    "  console.log('Hello World');",
    "  return 42;",
    "}",
    "",
    "function greet(name) {",
    "  alert('Hi ' + name);",
    "}",
  ].join("\n");
  rightText.value = [
    "function hello() {",
    "  console.log('Hello, World!');",
    "  return 42;",
    "}",
    "",
    "function greet(name = 'Guest') {",
    "  console.log('Hi ' + name);",
    "}",
    "",
    "function farewell(name) {",
    "  console.log('Goodbye ' + name);",
    "}",
  ].join("\n");
}

function swapTexts() {
  const tmp = leftText.value;
  leftText.value = rightText.value;
  rightText.value = tmp;
}

async function pasteLeft() {
  try {
    leftText.value = await navigator.clipboard.readText();
  } catch { /* clipboard denied */ }
}

async function pasteRight() {
  try {
    rightText.value = await navigator.clipboard.readText();
  } catch { /* clipboard denied */ }
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>文本 Diff</h2>
        <p>本地逐行对比两段文本，支持统一视图与并排视图，所有数据不离开本机</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" @click="loadSample">
          <i class="ri-flask-line" aria-hidden="true"></i>
          示例
        </button>
        <button type="button" class="secondary-button" @click="swapTexts">
          <i class="ri-arrow-left-right-line" aria-hidden="true"></i>
          交换
        </button>
        <button type="button" class="secondary-button" @click="clear">
          <i class="ri-eraser-line" aria-hidden="true"></i>
          清空
        </button>
      </div>
    </div>

    <div class="tool-main">
      <div class="dual-pane">
        <div class="code-pane">
          <div class="pane-head">
            <strong>原始文本</strong>
            <button type="button" class="secondary-button" style="padding:2px 8px;font-size:11px" @click="pasteLeft">
              <i class="ri-clipboard-line" aria-hidden="true"></i>
              粘贴
            </button>
          </div>
          <textarea v-model="leftText" spellcheck="false" placeholder="粘贴或输入原始文本..."></textarea>
        </div>
        <div class="code-pane">
          <div class="pane-head">
            <strong>修改后文本</strong>
            <button type="button" class="secondary-button" style="padding:2px 8px;font-size:11px" @click="pasteRight">
              <i class="ri-clipboard-line" aria-hidden="true"></i>
              粘贴
            </button>
          </div>
          <textarea v-model="rightText" spellcheck="false" placeholder="粘贴或输入修改后文本..."></textarea>
        </div>
      </div>

      <div v-if="rawDiff.length" class="diff-toolbar">
        <div class="segmented">
          <button type="button" :class="{ selected: mode === 'side-by-side' }" @click="mode = 'side-by-side'">
            <i class="ri-layout-column-line" aria-hidden="true"></i>
            并排
          </button>
          <button type="button" :class="{ selected: mode === 'unified' }" @click="mode = 'unified'">
            <i class="ri-list-view" aria-hidden="true"></i>
            统一
          </button>
        </div>
        <div class="diff-stats">
          <span class="stat-add">+{{ stats.added }}</span>
          <span class="stat-remove">&minus;{{ stats.removed }}</span>
        </div>
      </div>

      <div v-if="rawDiff.length" class="diff-output">
        <template v-if="mode === 'side-by-side'">
          <table class="diff-table diff-side-by-side">
            <colgroup>
              <col class="diff-num-col" />
              <col />
              <col class="diff-num-col" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th class="diff-num-head" colspan="2">原始文本</th>
                <th class="diff-num-head" colspan="2">修改后文本</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(pair, idx) in sideBySidePairs"
                :key="idx"
                :class="{
                  'diff-row-added': pair.right && !pair.left,
                  'diff-row-removed': pair.left && !pair.right,
                  'diff-row-changed': pair.left?.type === 'removed' && pair.right?.type === 'added',
                }"
              >
                <td class="diff-num">{{ pair.left?.leftNum ?? "" }}</td>
                <td class="diff-cell" :class="{ 'diff-cell-removed': pair.left?.type === 'removed' || (pair.left && !pair.right) }">
                  <pre>{{ pair.left?.content ?? "" }}</pre>
                </td>
                <td class="diff-num">{{ pair.right?.rightNum ?? "" }}</td>
                <td class="diff-cell" :class="{ 'diff-cell-added': pair.right?.type === 'added' || (pair.right && !pair.left) }">
                  <pre>{{ pair.right?.content ?? "" }}</pre>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else>
          <table class="diff-table diff-unified">
            <colgroup>
              <col class="diff-num-col" />
              <col class="diff-num-col" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th class="diff-num-head">-</th>
                <th class="diff-num-head">+</th>
                <th class="diff-content-head"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, idx) in unifiedHunks"
                :key="idx"
                :class="{
                  'diff-row-added': line.type === 'added',
                  'diff-row-removed': line.type === 'removed',
                }"
              >
                <td class="diff-num">{{ line.leftNum ?? "" }}</td>
                <td class="diff-num">{{ line.rightNum ?? "" }}</td>
                <td class="diff-cell" :class="{
                  'diff-cell-added': line.type === 'added',
                  'diff-cell-removed': line.type === 'removed',
                }">
                  <pre><span class="diff-marker">{{ line.type === "added" ? "+" : line.type === "removed" ? "-" : " " }}</span>{{ line.content }}</pre>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <p v-if="diffInput.error" class="warning-banner">{{ diffInput.error }}</p>

      <p v-else-if="(leftText || rightText) && !diffInput.error" class="empty-state">
        左右文本完全一致，没有差异。
      </p>
    </div>
  </section>
</template>

<style scoped>
.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.diff-stats {
  display: flex;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--mono, "Consolas", "Menlo", monospace);
}

.stat-add {
  color: #1a7f37;
}

.stat-remove {
  color: #cf222e;
}

[data-theme="dark"] .stat-add {
  color: #3fb950;
}

[data-theme="dark"] .stat-remove {
  color: #f85149;
}

.diff-output {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: auto;
  max-height: 540px;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
  font-family: var(--mono, "Consolas", "Menlo", monospace);
  font-size: 12px;
  line-height: 1.5;
}

.diff-table col.diff-num-col {
  width: 48px;
  min-width: 48px;
}

.diff-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.diff-table th {
  background: var(--subtle);
  color: var(--muted);
  font-weight: 600;
  text-align: center;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}

.diff-num {
  width: 48px;
  min-width: 48px;
  text-align: right;
  padding: 0 8px;
  color: var(--muted);
  user-select: none;
  vertical-align: top;
  border-right: 1px solid var(--border);
}

.diff-cell {
  padding: 0 10px;
  vertical-align: top;
}

.diff-cell pre {
  margin: 0;
  white-space: pre;
  overflow-x: auto;
}

.diff-marker {
  display: inline-block;
  width: 12px;
  user-select: none;
}

.diff-row-added {
  background: #dafbe1;
}

.diff-row-removed {
  background: #ffebe9;
}

.diff-row-changed {
  background: #fff3cd;
}

[data-theme="dark"] .diff-row-added {
  background: rgba(63, 185, 80, 0.15);
}

[data-theme="dark"] .diff-row-removed {
  background: rgba(248, 81, 73, 0.15);
}

[data-theme="dark"] .diff-row-changed {
  background: rgba(210, 153, 34, 0.15);
}

.diff-cell-added {
  background: #dafbe1;
}

.diff-cell-removed {
  background: #ffebe9;
}

[data-theme="dark"] .diff-cell-added {
  background: rgba(63, 185, 80, 0.2);
}

[data-theme="dark"] .diff-cell-removed {
  background: rgba(248, 81, 73, 0.2);
}

.diff-side-by-side .diff-num-head {
  text-align: left;
  padding-left: 56px;
}

.diff-side-by-side th {
  text-align: center;
}
</style>
