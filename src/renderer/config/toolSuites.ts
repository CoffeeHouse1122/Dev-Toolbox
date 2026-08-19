export type ToolSuiteTab = {
  path: string;
  label: string;
  icon: string;
};

export type ToolSuite = {
  id: string;
  label: string;
  to: string;
  icon: string;
  groupId: string;
  tabs: readonly ToolSuiteTab[];
};

export const toolSuites = [
  {
    id: "image-optimization",
    label: "图片优化",
    to: "/webp",
    icon: "ri-image-edit-line",
    groupId: "images",
    tabs: [
      { path: "/webp", label: "图片转换", icon: "ri-image-edit-line" },
      { path: "/image-compress", label: "图片压缩", icon: "ri-image-2-line" },
      { path: "/image-resize", label: "尺寸调整", icon: "ri-crop-line" },
      { path: "/image-crop", label: "自由裁剪", icon: "ri-scissors-cut-line" },
      { path: "/image-placeholder", label: "图片占位符", icon: "ri-blur-off-line" }
    ]
  },
  {
    id: "video-processing",
    label: "视频处理",
    to: "/video-compress",
    icon: "ri-video-ai-line",
    groupId: "media",
    tabs: [
      { path: "/video-compress", label: "视频压缩", icon: "ri-video-ai-line" },
      { path: "/video-mute", label: "视频去音频", icon: "ri-volume-mute-line" },
      { path: "/video-loop", label: "视频循环播放", icon: "ri-loop-left-line" }
    ]
  },
  {
    id: "animation-generation",
    label: "动图生成",
    to: "/video-animation",
    icon: "ri-file-gif-line",
    groupId: "media",
    tabs: [
      { path: "/video-animation", label: "视频动图", icon: "ri-file-gif-line" },
      { path: "/sequence-animation", label: "序列帧动图", icon: "ri-film-line" }
    ]
  },
  {
    id: "audio-processing",
    label: "音频处理",
    to: "/audio-convert",
    icon: "ri-music-2-line",
    groupId: "media",
    tabs: [
      { path: "/audio-convert", label: "音频转换", icon: "ri-music-2-line" },
      { path: "/audio-compress", label: "音频压缩", icon: "ri-volume-down-line" }
    ]
  },
  {
    id: "web-font",
    label: "Web 字体",
    to: "/woff2",
    icon: "ri-font-size-2",
    groupId: "font",
    tabs: [
      { path: "/woff2", label: "WOFF2 转换", icon: "ri-font-size-2" },
      { path: "/font-preview", label: "字体预览", icon: "ri-font-sans-serif" },
      { path: "/font-subset", label: "字体子集化", icon: "ri-scissors-cut-line" },
      { path: "/font-face", label: "@font-face", icon: "ri-braces-line" }
    ]
  },
  {
    id: "encoding-security",
    label: "编码与安全",
    to: "/jwt",
    icon: "ri-shield-keyhole-line",
    groupId: "text",
    tabs: [
      { path: "/jwt", label: "JWT 解析", icon: "ri-key-2-line" },
      { path: "/url-codec", label: "URL 编解码", icon: "ri-links-line" },
      { path: "/base64-text", label: "Base64 文本", icon: "ri-text-block" },
      { path: "/base64-image", label: "Base64 图片", icon: "ri-code-line" },
      { path: "/timestamp", label: "时间戳", icon: "ri-time-line" },
      { path: "/uuid", label: "UUID", icon: "ri-fingerprint-line" },
      { path: "/hash", label: "Hash / AES", icon: "ri-shield-keyhole-line" }
    ]
  },
  {
    id: "css-lab",
    label: "CSS 实验室",
    to: "/color-converter",
    icon: "ri-palette-line",
    groupId: "text",
    tabs: [
      { path: "/color-converter", label: "颜色转换器", icon: "ri-contrast-drop-line" },
      { path: "/css-clamp", label: "Clamp 字号", icon: "ri-font-size" }
    ]
  },
  {
    id: "seo-publish",
    label: "站点发布",
    to: "/seo-files",
    icon: "ri-global-line",
    groupId: "seo",
    tabs: [
      { path: "/seo-files", label: "robots / sitemap", icon: "ri-road-map-line" },
      { path: "/meta-tags", label: "HTML Meta", icon: "ri-meta-line" },
      { path: "/og-image", label: "OG 图片", icon: "ri-image-add-line" }
    ]
  },
  {
    id: "network-diagnostics",
    label: "网络诊断",
    to: "/ip-query",
    icon: "ri-router-line",
    groupId: "system-files",
    tabs: [
      { path: "/ip-query", label: "IP 查询", icon: "ri-router-line" },
      { path: "/certificate-scan", label: "证书扫描", icon: "ri-shield-check-line" }
    ]
  }
] as const satisfies readonly ToolSuite[];

export type ToolSuiteId = (typeof toolSuites)[number]["id"];

export const toolSuiteById = Object.fromEntries(
  toolSuites.map((suite) => [suite.id, suite])
) as Record<ToolSuiteId, (typeof toolSuites)[number]>;

export const legacyToolIdToSuiteId = Object.freeze({
  webp: "image-optimization",
  "image-compress": "image-optimization",
  "image-resize": "image-optimization",
  "image-crop": "image-optimization",
  "image-placeholder": "image-optimization",
  "video-compress": "video-processing",
  "video-mute": "video-processing",
  "video-loop": "video-processing",
  "video-animation": "animation-generation",
  "sequence-animation": "animation-generation",
  "audio-convert": "audio-processing",
  "audio-compress": "audio-processing",
  woff2: "web-font",
  "font-preview": "web-font",
  "font-subset": "web-font",
  "font-face": "web-font",
  jwt: "encoding-security",
  "url-codec": "encoding-security",
  "base64-text": "encoding-security",
  "base64-image": "encoding-security",
  timestamp: "encoding-security",
  uuid: "encoding-security",
  hash: "encoding-security",
  "color-converter": "css-lab",
  "css-clamp": "css-lab",
  "seo-files": "seo-publish",
  "meta-tags": "seo-publish",
  "og-image": "seo-publish",
  "ip-query": "network-diagnostics",
  "certificate-scan": "network-diagnostics"
} satisfies Record<string, ToolSuiteId>);

const toolSuiteByPath = new Map<string, (typeof toolSuites)[number]>(
  toolSuites.flatMap((suite) => suite.tabs.map((tab) => [tab.path, suite] as const))
);

function normalizePath(path: string) {
  const pathname = path.trim().split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

export function getToolSuiteByPath(path: string): ToolSuite | undefined {
  return toolSuiteByPath.get(normalizePath(path));
}

export function getToolSuiteForEntryId(id: string): ToolSuite | undefined {
  const normalizedId = id.trim().replace(/^\/+|\/+$/g, "");
  const suiteId = legacyToolIdToSuiteId[normalizedId] ?? normalizedId;
  return toolSuiteById[suiteId as ToolSuiteId];
}
