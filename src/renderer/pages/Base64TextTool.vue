<script setup lang="ts">
import { computed, ref } from "vue";
import iconv from "iconv-lite";
import { Buffer } from "buffer";
import SelectMenu from "../components/SelectMenu.vue";

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
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>Base64 文本编解码</h2>
        <p>文本字符串与 Base64 互转，支持指定字符编码</p>
      </div>
      <div class="header-actions">
        <div class="segmented">
          <button type="button" :class="{ selected: mode === 'encode' }" @click="mode = 'encode'">编码</button>
          <button type="button" :class="{ selected: mode === 'decode' }" @click="mode = 'decode'">解码</button>
        </div>
      </div>
    </div>

    <div class="tool-main">
      <label class="field">
        <span>字符编码</span>
        <SelectMenu v-model="charset" :options="charsetOptions" />
      </label>

      <div class="io-pair">
        <div class="io-block">
          <div class="io-label">输入 ({{ charCount.input }} 字符)</div>
          <textarea v-model="input" class="tool-textarea" :placeholder="mode === 'encode' ? '输入要编码的文本...' : '输入 Base64 字符串...'"></textarea>
        </div>
        <div class="io-block">
          <div class="io-label">输出 ({{ charCount.output }} 字符)</div>
          <textarea class="tool-textarea" readonly :value="output" placeholder="结果将显示在这里"></textarea>
        </div>
      </div>
    </div>
  </section>
</template>
