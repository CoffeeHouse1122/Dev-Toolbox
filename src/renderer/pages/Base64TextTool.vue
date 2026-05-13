<script setup lang="ts">
import { computed, ref } from "vue";

const input = ref("");
const mode = ref<"encode" | "decode">("encode");
const charset = ref("utf-8");

const output = computed(() => {
  const raw = input.value;
  if (!raw) return "";
  try {
    if (mode.value === "encode") {
      const bytes = new TextEncoder().encode(raw);
      return btoa(String.fromCharCode(...bytes));
    } else {
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder(charset.value).decode(bytes);
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
        <select v-model="charset" class="native-select">
          <option value="utf-8">UTF-8</option>
          <option value="gbk">GBK</option>
          <option value="gb2312">GB2312</option>
          <option value="big5">Big5</option>
          <option value="shift_jis">Shift-JIS</option>
          <option value="euc-kr">EUC-KR</option>
          <option value="iso-8859-1">ISO-8859-1</option>
          <option value="windows-1252">Windows-1252</option>
        </select>
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
