<script setup lang="ts">
import { ref, computed } from "vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref("");
const mode = ref<"hash" | "encrypt" | "decrypt">("hash");
const algorithm = ref<"MD5" | "SHA-1" | "SHA-256" | "SHA-512">("SHA-256");
const uppercase = ref(false);
const encryptKey = ref("");
const output = ref("");
const busy = ref(false);

function setUppercase(value: boolean) {
  uppercase.value = value;
  output.value = "";
}

// ---- 哈希 ---- //

async function computeHash() {
  if (!input.value) { output.value = ""; return; }
  busy.value = true;
  try {
    const data = new TextEncoder().encode(input.value);
    let hex = "";
    if (algorithm.value === "MD5") {
      hex = await md5(data);
    } else {
      const hashBuffer = await crypto.subtle.digest(algorithm.value, data);
      hex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    output.value = uppercase.value ? hex.toUpperCase() : hex;
  } catch (e: any) {
    output.value = `错误: ${e.message}`;
  } finally {
    busy.value = false;
  }
}

/** 纯 JS MD5 */
async function md5(data: Uint8Array): Promise<string> {
  function rotl(x: number, n: number) { return (x << n) | (x >>> (32 - n)); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return ((a + q + x + t) >>> 0, rotl((a + q + x + t) >>> 0, s) + b) >>> 0;
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  const len = data.length;
  const words: number[] = [];
  for (let i = 0; i < len; i++) words[i >> 2] |= data[i] << ((i % 4) * 8);
  const bitLen = len * 8;
  words[bitLen >>> 5] |= 0x80 << (bitLen % 32);
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < words.length; i += 16) {
    const oldA = a, oldB = b, oldC = c, oldD = d;
    const w = words.slice(i, i + 16);
    while (w.length < 16) w.push(0);
    a = ff(a,b,c,d,w[0],7,0xd76aa478);d=ff(d,a,b,c,w[1],12,0xe8c7b756);c=ff(c,d,a,b,w[2],17,0x242070db);b=ff(b,c,d,a,w[3],22,0xc1bdceee);
    a = ff(a,b,c,d,w[4],7,0xf57c0faf);d=ff(d,a,b,c,w[5],12,0x4787c62a);c=ff(c,d,a,b,w[6],17,0xa8304613);b=ff(b,c,d,a,w[7],22,0xfd469501);
    a = ff(a,b,c,d,w[8],7,0x698098d8);d=ff(d,a,b,c,w[9],12,0x8b44f7af);c=ff(c,d,a,b,w[10],17,0xffff5bb1);b=ff(b,c,d,a,w[11],22,0x895cd7be);
    a = ff(a,b,c,d,w[12],7,0x6b901122);d=ff(d,a,b,c,w[13],12,0xfd987193);c=ff(c,d,a,b,w[14],17,0xa679438e);b=ff(b,c,d,a,w[15],22,0x49b40821);
    a = gg(a,b,c,d,w[1],5,0xf61e2562);d=gg(d,a,b,c,w[6],9,0xc040b340);c=gg(c,d,a,b,w[11],14,0x265e5a51);b=gg(b,c,d,a,w[0],20,0xe9b6c7aa);
    a = gg(a,b,c,d,w[5],5,0xd62f105d);d=gg(d,a,b,c,w[10],9,0x02441453);c=gg(c,d,a,b,w[15],14,0xd8a1e681);b=gg(b,c,d,a,w[4],20,0xe7d3fbc8);
    a = gg(a,b,c,d,w[9],5,0x21e1cde6);d=gg(d,a,b,c,w[14],9,0xc33707d6);c=gg(c,d,a,b,w[3],14,0xf4d50d87);b=gg(b,c,d,a,w[8],20,0x455a14ed);
    a = gg(a,b,c,d,w[13],5,0xa9e3e905);d=gg(d,a,b,c,w[2],9,0xfcefa3f8);c=gg(c,d,a,b,w[7],14,0x676f02d9);b=gg(b,c,d,a,w[12],20,0x8d2a4c8a);
    a = hh(a,b,c,d,w[5],4,0xfffa3942);d=hh(d,a,b,c,w[8],11,0x8771f681);c=hh(c,d,a,b,w[11],16,0x6d9d6122);b=hh(b,c,d,a,w[14],23,0xfde5380c);
    a = hh(a,b,c,d,w[1],4,0xa4beea44);d=hh(d,a,b,c,w[4],11,0x4bdecfa9);c=hh(c,d,a,b,w[7],16,0xf6bb4b60);b=hh(b,c,d,a,w[10],23,0xbebfbc70);
    a = hh(a,b,c,d,w[13],4,0x289b7ec6);d=hh(d,a,b,c,w[0],11,0xeaa127fa);c=hh(c,d,a,b,w[3],16,0xd4ef3085);b=hh(b,c,d,a,w[6],23,0x04881d05);
    a = hh(a,b,c,d,w[9],4,0xd9d4d039);d=hh(d,a,b,c,w[12],11,0xe6db99e5);c=hh(c,d,a,b,w[15],16,0x1fa27cf8);b=hh(b,c,d,a,w[2],23,0xc4ac5665);
    a = ii(a,b,c,d,w[0],6,0xf4292244);d=ii(d,a,b,c,w[7],10,0x432aff97);c=ii(c,d,a,b,w[14],15,0xab9423a7);b=ii(b,c,d,a,w[5],21,0xfc93a039);
    a = ii(a,b,c,d,w[12],6,0x655b59c3);d=ii(d,a,b,c,w[3],10,0x8f0ccc92);c=ii(c,d,a,b,w[10],15,0xffeff47d);b=ii(b,c,d,a,w[1],21,0x85845dd1);
    a = ii(a,b,c,d,w[8],6,0x6fa87e4f);d=ii(d,a,b,c,w[15],10,0xfe2ce6e0);c=ii(c,d,a,b,w[6],15,0xa3014314);b=ii(b,c,d,a,w[13],21,0x4e0811a1);
    a = ii(a,b,c,d,w[4],6,0xf7537e82);d=ii(d,a,b,c,w[11],10,0xbd3af235);c=ii(c,d,a,b,w[2],15,0x2ad7d2bb);b=ii(b,c,d,a,w[9],21,0xeb86d391);
    a = (a+oldA)>>>0;b=(b+oldB)>>>0;c=(c+oldC)>>>0;d=(d+oldD)>>>0;
  }
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return toHex(a&0xff)+toHex((a>>>8)&0xff)+toHex((a>>>16)&0xff)+toHex((a>>>24)&0xff)+
    toHex(b&0xff)+toHex((b>>>8)&0xff)+toHex((b>>>16)&0xff)+toHex((b>>>24)&0xff)+
    toHex(c&0xff)+toHex((c>>>8)&0xff)+toHex((c>>>16)&0xff)+toHex((c>>>24)&0xff)+
    toHex(d&0xff)+toHex((d>>>8)&0xff)+toHex((d>>>16)&0xff)+toHex((d>>>24)&0xff);
}

// ---- AES-GCM 加解密 ---- //

const encryptedPayloadPrefix = "DTBX1.";
const pbkdf2Iterations = 310_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: pbkdf2Iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function legacyKey(password: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function doEncrypt() {
  if (!input.value || !encryptKey.value) { output.value = ""; return; }
  busy.value = true;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(encryptKey.value, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(input.value);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(salt.length + iv.length + cipher.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(cipher), salt.length + iv.length);
    output.value = `${encryptedPayloadPrefix}${bytesToBase64(combined)}`;
  } catch (e: any) {
    output.value = `加密失败: ${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function doDecrypt() {
  if (!input.value || !encryptKey.value) { output.value = ""; return; }
  busy.value = true;
  try {
    const value = input.value.trim();
    const versioned = value.startsWith(encryptedPayloadPrefix);
    const combined = base64ToBytes(versioned ? value.slice(encryptedPayloadPrefix.length) : value);
    if (combined.length < (versioned ? 29 : 13)) throw new Error("密文格式无效");
    const salt = versioned ? combined.slice(0, 16) : null;
    const iv = versioned ? combined.slice(16, 28) : combined.slice(0, 12);
    const cipher = versioned ? combined.slice(28) : combined.slice(12);
    const key = salt ? await deriveKey(encryptKey.value, salt) : await legacyKey(encryptKey.value);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    output.value = new TextDecoder().decode(plain);
  } catch (e: any) {
    output.value = `解密失败: ${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function doAction() {
  if (mode.value === "hash") await computeHash();
  else if (mode.value === "encrypt") await doEncrypt();
  else await doDecrypt();
}

const actionLabel = computed(() => {
  if (mode.value === "hash") return "计算哈希";
  return mode.value === "encrypt" ? "加密" : "解密";
});

const resultLabel = computed(() => {
  if (mode.value === "hash") return `${algorithm.value} 结果`;
  return mode.value === "encrypt" ? "加密结果 (DTBX1)" : "解密结果 (明文)";
});

const weakHashWarning = computed(() => mode.value === "hash" && (algorithm.value === "MD5" || algorithm.value === "SHA-1"));
</script>

<template>
  <TaskFlowLayout
    title="Hash / 加解密"
    description="MD5 / SHA 哈希及 AES-GCM 对称加解密"
    :source-title="mode === 'decrypt' ? '待解密密文' : mode === 'hash' ? '待计算文本' : '待加密文本'"
    :source-description="mode === 'decrypt' ? '支持 DTBX1 与旧版 Base64 密文' : '输入内容后配置处理参数，再执行本次任务'"
    settings-title="处理参数"
    :settings-description="mode === 'hash' ? '选择摘要算法与输出格式' : '使用同一密钥完成 AES-GCM 加解密'"
    :file-label="`${input.length} 字符`"
  >
    <template #source-actions>
      <div class="hash-mode-switch">
        <div class="segmented">
          <button type="button" :class="{ selected: mode === 'hash' }" @click="mode = 'hash'; output = ''">哈希</button>
          <button type="button" :class="{ selected: mode === 'encrypt' }" @click="mode = 'encrypt'; output = ''">加密</button>
          <button type="button" :class="{ selected: mode === 'decrypt' }" @click="mode = 'decrypt'; output = ''">解密</button>
        </div>
      </div>
    </template>

    <template #source>
      <textarea
        v-model="input"
        class="tool-textarea hash-source-input"
        :placeholder="mode === 'decrypt' ? '粘贴 Base64 密文...' : mode === 'hash' ? '输入要计算哈希的文本...' : '输入要加密的文本...'"
      ></textarea>
    </template>

    <template #settings>
      <!-- 哈希模式：算法选择 + 大写 -->
      <div v-if="mode === 'hash'" class="hash-settings">
        <div class="field">
          <span>摘要算法</span>
          <div class="segmented hash-algorithms">
            <button v-for="algo in ['MD5','SHA-1','SHA-256','SHA-512']" :key="algo" type="button" :class="{ selected: algorithm === algo }" @click="algorithm = algo as any; output = ''">
              {{ algo }}
            </button>
          </div>
        </div>
        <Checkbox class="hash-check-label" :model-value="uppercase" label="结果使用大写字母" @update:model-value="setUppercase" />
        <p v-if="weakHashWarning" class="warning-banner">
          {{ algorithm }} 已不适合密码、签名或完整性安全场景；兼容用途之外请使用 SHA-256 或 SHA-512。
        </p>
        <p v-else class="hash-method-note">
          SHA-256 与 SHA-512 更适合日常完整性校验，结果仅在本机浏览器环境计算。
        </p>
      </div>

      <!-- 加解密模式：密钥输入 -->
      <div v-else class="hash-settings">
        <label class="field">
          <span>加密 / 解密密钥</span>
          <input v-model="encryptKey" type="password" class="tool-input" placeholder="输入加密/解密密钥" />
        </label>
        <p class="hash-method-note">
          新密文使用 AES-256-GCM + PBKDF2-SHA-256（随机盐，{{ pbkdf2Iterations.toLocaleString() }} 次）；解密仍兼容旧版密文。
        </p>
      </div>
    </template>

    <template #result>
      <aside class="result-panel hash-result-panel">
        <div class="section-title">
          <h2>{{ resultLabel }}</h2>
          <span class="status-pill" :class="output ? 'success' : ''">{{ output ? "READY" : "WAITING" }}</span>
        </div>
        <textarea class="tool-textarea code-output hash-result-output" readonly :value="output" placeholder="结果将显示在这里"></textarea>
      </aside>
    </template>

    <template #summary>
      <i :class="mode === 'hash' ? 'ri-fingerprint-line' : mode === 'encrypt' ? 'ri-lock-line' : 'ri-lock-unlock-line'" aria-hidden="true"></i>
      <span v-if="mode === 'hash'">{{ algorithm }} · {{ uppercase ? "大写" : "小写" }}</span>
      <span v-else>{{ mode === "encrypt" ? "AES-256-GCM 加密" : "AES-256-GCM 解密" }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="busy || !input || (mode !== 'hash' && !encryptKey)" @click="doAction">
        <i v-if="mode === 'hash'" class="ri-fingerprint-line" aria-hidden="true"></i>
        <i v-else-if="mode === 'encrypt'" class="ri-lock-line" aria-hidden="true"></i>
        <i v-else class="ri-lock-unlock-line" aria-hidden="true"></i>
        {{ actionLabel }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.hash-mode-switch,
.hash-mode-switch .segmented {
  min-width: 0;
}

.hash-source-input {
  min-height: 112px;
  max-height: 170px;
  resize: vertical;
}

.hash-settings {
  display: grid;
  gap: 16px;
  align-content: start;
}

.hash-algorithms {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hash-algorithms button {
  min-width: 0;
}

.hash-check-label {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}

.hash-method-note {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}

.warning-banner {
  margin: 0;
}

.hash-result-panel {
  min-height: 0;
}

.hash-result-output {
  height: 100%;
  min-height: 0;
  resize: none;
}

.primary-button i {
  margin-right: 6px;
}

@media (max-width: 720px) {
  .hash-mode-switch,
  .hash-mode-switch .segmented {
    width: 100%;
  }

  .hash-mode-switch .segmented button {
    flex: 1;
  }
}
</style>
