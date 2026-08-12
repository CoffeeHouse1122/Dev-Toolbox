<script setup lang="ts">
import { computed, ref } from "vue";
import { toPng } from "html-to-image";
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const code = ref(
  `function fibonacci(n) {\n  if (n < 2) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10));\n`
);
const language = ref("javascript");
const fileName = ref("example.js");
const themeKey = ref<keyof typeof themes>("nightOwl");
const padding = ref(40);
const showWindow = ref(true);
const showLineNumbers = ref(true);
const fontFamily = ref(`"Source Han Sans CN", "SourceHanSansCN", "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace`);
const fontSize = ref(14);
const stage = ref<HTMLElement | null>(null);
const frame = ref<HTMLElement | null>(null);

const themes = {
  nightOwl: {
    label: "Night Owl",
    bg: "linear-gradient(135deg, #1c2541 0%, #0b1d3a 100%)",
    surface: "#011627",
    text: "#d6deeb",
    line: "#637777",
    keyword: "#c792ea",
    string: "#ecc48d",
    comment: "#637777",
    fn: "#82aaff",
    number: "#f78c6c"
  },
  oneDark: {
    label: "One Dark",
    bg: "linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)",
    surface: "#282c34",
    text: "#abb2bf",
    line: "#5c6370",
    keyword: "#c678dd",
    string: "#98c379",
    comment: "#5c6370",
    fn: "#61afef",
    number: "#d19a66"
  },
  github: {
    label: "GitHub Light",
    bg: "linear-gradient(135deg, #fda085 0%, #f6d365 100%)",
    surface: "#ffffff",
    text: "#24292f",
    line: "#8c959f",
    keyword: "#cf222e",
    string: "#0a3069",
    comment: "#6e7781",
    fn: "#8250df",
    number: "#0550ae"
  },
  monokai: {
    label: "Monokai",
    bg: "linear-gradient(135deg, #f857a6 0%, #ff5858 100%)",
    surface: "#272822",
    text: "#f8f8f2",
    line: "#75715e",
    keyword: "#f92672",
    string: "#e6db74",
    comment: "#75715e",
    fn: "#a6e22e",
    number: "#ae81ff"
  },
  solarized: {
    label: "Solarized",
    bg: "linear-gradient(135deg, #fdfcdc 0%, #d4f1f9 100%)",
    surface: "#fdf6e3",
    text: "#586e75",
    line: "#93a1a1",
    keyword: "#859900",
    string: "#2aa198",
    comment: "#93a1a1",
    fn: "#268bd2",
    number: "#cb4b16"
  }
} as const;

const theme = computed(() => themes[themeKey.value]);

// Very lightweight tokenizer (regex-based, intentionally simple).
const tokens = computed(() => {
  return tokenize(code.value, language.value, theme.value);
});

type Token = { text: string; color?: string; bold?: boolean };

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tokenize(src: string, lang: string, t: typeof themes[keyof typeof themes]) {
  const lines = src.split(/\n/);
  return lines.map((line) => tokenizeLine(line, lang, t));
}

const KEYWORDS: Record<string, string[]> = {
  javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "export", "class", "new", "true", "false", "null", "undefined", "async", "await", "try", "catch", "throw", "from", "of", "in", "this", "extends", "super", "default", "break", "continue", "switch", "case"],
  typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "export", "class", "new", "true", "false", "null", "undefined", "async", "await", "try", "catch", "throw", "from", "of", "in", "this", "extends", "super", "default", "break", "continue", "switch", "case", "type", "interface", "enum", "as", "satisfies", "readonly", "public", "private", "protected", "static"],
  python: ["def", "return", "if", "elif", "else", "for", "while", "import", "from", "class", "True", "False", "None", "async", "await", "try", "except", "raise", "with", "as", "in", "is", "not", "and", "or", "lambda", "yield", "pass", "break", "continue", "self"],
  json: ["true", "false", "null"],
  yaml: [],
  toml: [],
  bash: ["if", "then", "else", "fi", "for", "while", "do", "done", "case", "esac", "function", "return", "in", "echo", "export"],
  html: [],
  css: []
};

function tokenizeLine(line: string, lang: string, t: typeof themes[keyof typeof themes]): Token[] {
  const result: Token[] = [];
  const keywords = KEYWORDS[lang] ?? [];
  // Single-pass regex with captures for: comment, string, number, identifier, other.
  const re = /(\/\/[^\n]*|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([\p{L}\p{Nl}_$][\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}$\u200C\u200D]*)|(\s+)|([^\p{L}\p{N}_$\s])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const [full, comment, str, num, ident, ws, sym] = m;
    if (comment) result.push({ text: full, color: t.comment });
    else if (str) result.push({ text: full, color: t.string });
    else if (num) result.push({ text: full, color: t.number });
    else if (ident) {
      if (keywords.includes(ident)) result.push({ text: full, color: t.keyword, bold: true });
      else if (line.slice(re.lastIndex, re.lastIndex + 1) === "(") result.push({ text: full, color: t.fn });
      else result.push({ text: full });
    }
    else if (ws) result.push({ text: full });
    else if (sym) result.push({ text: full });
  }
  return result;
}

function renderLineHtml(tokens: Token[]) {
  return tokens
    .map((tk) => {
      const safe = escapeHtml(tk.text);
      const styles: string[] = [];
      if (tk.color) styles.push(`color:${tk.color}`);
      if (tk.bold) styles.push("font-weight:600");
      return styles.length ? `<span style="${styles.join(";")}">${safe}</span>` : safe;
    })
    .join("");
}

const langOptions = [
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "Python", value: "python" },
  { label: "JSON", value: "json" },
  { label: "YAML", value: "yaml" },
  { label: "TOML", value: "toml" },
  { label: "Bash", value: "bash" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" }
];

async function exportPng() {
  if (!frame.value) return;
  showWorkspaceToast("正在生成图片…");
  try {
    const dataUrl = await toPng(frame.value, { pixelRatio: 2, cacheBust: true });
    const a = document.createElement("a");
    a.href = dataUrl;
    const safeName = (fileName.value || "code-shot")
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "code-shot";
    a.download = `${safeName}.png`;
    a.click();
    showWorkspaceToast("已下载 PNG。", "success");
  } catch (error) {
    showWorkspaceToast(error instanceof Error ? error.message : String(error), "error");
  }
}

async function copyImage() {
  if (!frame.value) return;
  showWorkspaceToast("正在复制…");
  try {
    const dataUrl = await toPng(frame.value, { pixelRatio: 2, cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    if (typeof ClipboardItem === "undefined") {
      throw new Error("当前环境不支持 ClipboardItem。");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showWorkspaceToast("图片已复制到剪贴板。", "success");
  } catch (error) {
    showWorkspaceToast(error instanceof Error ? error.message : String(error), "error");
  }
}
</script>

<template>
  <TaskFlowLayout
    title="美化代码截图"
    description="类似 Carbon 的代码截图工具，支持多主题、行号、窗口装饰，导出 PNG / 复制到剪贴板"
    source-title="源码输入"
    source-description="编辑代码内容，右侧画布将实时同步渲染"
    settings-title="截图样式"
    settings-description="设置主题、语言、排版与窗口装饰"
    preview-title="截图预览"
    preview-description="预览内容即最终导出的图片区域"
    :file-label="`${tokens.length} 行`"
    variant="preview-dominant"
  >
    <template #source>
      <textarea
        v-model="code"
        class="tool-textarea code-shot-source"
        aria-label="代码内容"
        spellcheck="false"
      ></textarea>
    </template>

    <template #settings>
      <div class="code-shot-settings">
        <label class="field">
          <span>主题</span>
          <div class="segmented compact-segmented">
            <button
              v-for="(value, key) in themes"
              :key="key"
              type="button"
              :class="{ selected: themeKey === key }"
              @click="themeKey = key as keyof typeof themes"
            >
              {{ value.label }}
            </button>
          </div>
        </label>
        <label class="field">
          <span>语言</span>
          <div class="segmented compact-segmented">
            <button
              v-for="opt in langOptions"
              :key="opt.value"
              type="button"
              :class="{ selected: language === opt.value }"
              @click="language = opt.value"
            >{{ opt.label }}</button>
          </div>
        </label>
        <label class="field">
          <span>文件名</span>
          <input v-model="fileName" placeholder="example.js" />
        </label>
        <label class="field">
          <span>背景内边距</span>
          <Slider v-model="padding" :min="0" :max="120" unit="px" aria-label="背景内边距" />
        </label>
        <label class="field">
          <span>字号</span>
          <Slider v-model="fontSize" :min="10" :max="22" unit="px" aria-label="字号" />
        </label>
        <div class="code-shot-toggles">
          <Checkbox v-model="showWindow" class="check-row" label="显示窗口装饰" />
          <Checkbox v-model="showLineNumbers" class="check-row" label="显示行号" />
        </div>
      </div>
    </template>

    <template #preview-actions>
      <span class="status-pill success">实时预览</span>
    </template>

    <template #preview>
      <div ref="stage" class="code-shot-stage" :style="{ background: theme.bg }">
        <div
          ref="frame"
          class="code-shot-frame"
          :class="{ padded: !showWindow }"
          :style="{ background: theme.surface, color: theme.text, fontFamily: fontFamily, fontSize: `${fontSize}px`, padding: showWindow ? '0' : `${padding}px` }"
        >
          <div v-if="showWindow" class="code-shot-window">
            <div class="code-shot-dots">
              <span class="code-shot-dot" style="background: #ff5f56;"></span>
              <span class="code-shot-dot" style="background: #ffbd2e;"></span>
              <span class="code-shot-dot" style="background: #27c93f;"></span>
            </div>
            <span class="code-shot-title">{{ fileName }}</span>
          </div>
          <pre class="code-shot-body" :style="{ paddingLeft: showLineNumbers ? '14px' : '22px' }"><code><template v-for="(line, i) in tokens" :key="i"><span v-if="showLineNumbers" :style="{ color: theme.line, display: 'inline-block', width: '2.5em', textAlign: 'right', marginRight: '14px', userSelect: 'none' }">{{ i + 1 }}</span><span v-html="renderLineHtml(line)"></span>
</template></code></pre>
        </div>
      </div>
    </template>

    <template #summary>
      <i class="ri-image-line" aria-hidden="true"></i>
      <span>{{ theme.label }} · {{ language }} · {{ fontSize }}px</span>
    </template>

    <template #actions>
      <button type="button" class="secondary-button" @click="copyImage">
        <i class="ri-clipboard-line" aria-hidden="true"></i>
        复制图片
      </button>
      <button type="button" class="primary-button" @click="exportPng">
        <i class="ri-download-2-line" aria-hidden="true"></i>
        下载 PNG
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.code-shot-source {
  min-height: 82px;
  max-height: 112px;
  resize: vertical;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 13px;
}

.code-shot-settings {
  display: grid;
  gap: 14px;
}

.compact-segmented {
  flex-wrap: wrap;
}

.compact-segmented button {
  padding-inline: 9px;
}

.code-shot-toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.code-shot-stage {
  width: 100%;
  height: 100%;
  min-height: 260px;
  padding: 20px;
}

.code-shot-frame {
  max-height: 100%;
}

@media (max-width: 720px) {
  .code-shot-toggles {
    grid-template-columns: 1fr;
  }
}
</style>
