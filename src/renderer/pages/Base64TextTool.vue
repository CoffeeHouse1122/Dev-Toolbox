<script setup lang="ts">
import { computed, ref } from "vue";
import iconv from "iconv-lite";
import { Buffer } from "buffer";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref("");
const mode = ref<"encode" | "decode">("encode");
const charset = ref("utf-8");

const charsetOptions = [
  { label: "UTF-8", value: "utf-8" },
  { label: "GBK", value: "gbk" },
  { label: "GB2312", value: "gb2312" },
  { label: "Big5", value: "big5" },
  { label: "Shift-JIS", value: "shift_jis" },
  { label: "EUC-KR", value: "euc-kr" },
  { label: "ISO-8859-1", value: "iso-8859-1" },
  { label: "Windows-1252", value: "windows-1252" }
];

const iconvEncoding = computed(() => ({
  "shift_jis": "shift-jis",
  "euc-kr": "euckr"
}[charset.value] ?? charset.value));

const output = computed(() => {
  const raw = input.value;
  if (!raw) return "";
  try {
    if (mode.value === "encode") {
      if (!iconv.encodingExists(iconvEncoding.value)) throw new Error(`不支持字符编码：${charset.value}`);
      return iconv.encode(raw, iconvEncoding.value).toString("base64");
    } else {
      const normalized = raw.replace(/\s+/g, "");
      if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
        throw new Error("请输入有效的 Base64 字符串");
      }
      return iconv.decode(Buffer.from(normalized, "base64"), iconvEncoding.value);
    }
  } catch (error) {
    return error instanceof Error ? `错误: ${error.message}` : String(error);
  }
});

const charCount = computed(() => ({ input: input.value.length, output: output.value.length }));
</script>

<template>
  <TaskFlowLayout
    title="Base64 文本编解码"
    description="文本字符串与 Base64 互转，支持指定字符编码"
    :source-title="mode === 'encode' ? '待编码文本' : '待解码 Base64'"
    source-description="内容变化后即时转换，无需额外执行"
    settings-title="转换参数"
    settings-description="选择转换方向与源文本字符编码"
    :preview-title="mode === 'encode' ? 'Base64 输出' : '文本输出'"
    preview-description="结果随输入和编码设置实时更新"
    :file-label="`${charCount.input} 字符`"
    variant="preview-dominant"
  >
    <template #source-actions>
      <div class="base64-mode-switch">
        <div class="segmented">
          <button type="button" :class="{ selected: mode === 'encode' }" @click="mode = 'encode'">编码</button>
          <button type="button" :class="{ selected: mode === 'decode' }" @click="mode = 'decode'">解码</button>
        </div>
      </div>
    </template>

    <template #source>
      <textarea
        v-model="input"
        class="tool-textarea code-output base64-source-input"
        :placeholder="mode === 'encode' ? '输入要编码的文本...' : '输入 Base64 字符串...'"
      ></textarea>
    </template>

    <template #settings>
      <div class="base64-settings">
        <div class="field">
          <span>字符编码</span>
          <SelectMenu v-model="charset" :options="charsetOptions" />
        </div>
        <div class="base64-mode-summary">
          <i :class="mode === 'encode' ? 'ri-code-s-slash-line' : 'ri-text'" aria-hidden="true"></i>
          <div>
            <strong>{{ mode === "encode" ? "文本 → Base64" : "Base64 → 文本" }}</strong>
            <span>使用 {{ charsetOptions.find((item) => item.value === charset)?.label }} 处理字符</span>
          </div>
        </div>
      </div>
    </template>

    <template #preview-actions>
      <span class="status-pill" :class="output.startsWith('错误:') ? 'error' : output ? 'success' : ''">
        {{ output.startsWith("错误:") ? "ERROR" : `${charCount.output} 字符` }}
      </span>
    </template>

    <template #preview>
      <textarea
        class="tool-textarea code-output base64-output"
        readonly
        :value="output"
        placeholder="结果将显示在这里"
      ></textarea>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.base64-mode-switch,
.base64-mode-switch .segmented {
  min-width: 0;
}

.base64-source-input {
  min-height: 126px;
  max-height: 190px;
  resize: vertical;
}

.base64-settings {
  display: grid;
  gap: 16px;
  align-content: start;
}

.base64-mode-summary {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.base64-mode-summary > i {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-strong);
  font-size: 18px;
}

.base64-mode-summary div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.base64-mode-summary strong {
  font-size: 13px;
}

.base64-mode-summary span {
  color: var(--muted);
  font-size: 12px;
}

.base64-output {
  width: 100%;
  height: 100%;
  min-height: 240px;
  resize: none;
}

@media (max-width: 720px) {
  .base64-mode-switch,
  .base64-mode-switch .segmented {
    width: 100%;
  }

  .base64-mode-switch .segmented button {
    flex: 1;
  }
}
</style>
