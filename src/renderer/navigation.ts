import type { InjectionKey, Ref } from "vue";

export type NavTool = {
  id: string;
  to: string;
  label: string;
  icon: string;
  visible: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  collapsed?: boolean;
  tools: NavTool[];
};

export type NavConfig = {
  groups: NavGroup[];
  collapsedGroups: Record<string, boolean>;
  favoriteToolIds: string[];
};

export const defaultGroups: NavGroup[] = [
  {
    id: "images",
    label: "图片工作台",
    tools: [
      { id: "favicon", to: "/favicon", label: "图标生成", icon: "ri-star-smile-line", visible: true },
      { id: "svg-toolbox", to: "/svg-toolbox", label: "SVG 工具箱", icon: "ri-shapes-line", visible: true },
      { id: "pwa-icons", to: "/pwa-icons", label: "PWA 图标包", icon: "ri-smartphone-line", visible: true },
      { id: "webp", to: "/webp", label: "图片转换", icon: "ri-image-edit-line", visible: true },
      { id: "image-compress", to: "/image-compress", label: "图片压缩", icon: "ri-image-2-line", visible: true },
      { id: "image-resize", to: "/image-resize", label: "尺寸调整", icon: "ri-crop-line", visible: true },
      { id: "image-crop", to: "/image-crop", label: "自由裁剪", icon: "ri-scissors-cut-line", visible: true },
      { id: "watermark", to: "/watermark", label: "添加水印", icon: "ri-contrast-drop-2-line", visible: true },
      { id: "image-placeholder", to: "/image-placeholder", label: "图片占位符", icon: "ri-blur-off-line", visible: true },
      { id: "base64-image", to: "/base64-image", label: "Base64 图片", icon: "ri-code-line", visible: true },
      { id: "qr-code", to: "/qr-code", label: "二维码生成", icon: "ri-qr-code-line", visible: true }
    ]
  },
  {
    id: "media",
    label: "音视频工作台",
    tools: [
      { id: "video-background", to: "/video-background", label: "视频转化", icon: "ri-movie-2-line", visible: true },
      { id: "video-animation", to: "/video-animation", label: "视频动图", icon: "ri-file-gif-line", visible: true },
      { id: "sequence-animation", to: "/sequence-animation", label: "序列帧动图", icon: "ri-film-line", visible: true },
      { id: "video-mute", to: "/video-mute", label: "视频去音频", icon: "ri-volume-mute-line", visible: true },
      { id: "video-compress", to: "/video-compress", label: "视频压缩", icon: "ri-video-ai-line", visible: true },
      { id: "video-loop", to: "/video-loop", label: "视频循环播放", icon: "ri-loop-left-line", visible: true },
      { id: "audio-convert", to: "/audio-convert", label: "音频转换", icon: "ri-music-2-line", visible: true },
      { id: "audio-compress", to: "/audio-compress", label: "音频压缩", icon: "ri-volume-down-line", visible: true }
    ]
  },
  {
    id: "font",
    label: "字体工作台",
    tools: [
      { id: "woff2", to: "/woff2", label: "WOFF2 转换", icon: "ri-font-size-2", visible: true },
      { id: "font-preview", to: "/font-preview", label: "字体预览", icon: "ri-font-sans-serif", visible: true },
      { id: "font-subset", to: "/font-subset", label: "字体子集化", icon: "ri-scissors-cut-line", visible: true },
      { id: "font-face", to: "/font-face", label: "@font-face", icon: "ri-braces-line", visible: true }
    ]
  },
  {
    id: "text",
    label: "文本与样式工作台",
    tools: [
      { id: "markdown-export", to: "/markdown-export", label: "Markdown", icon: "ri-markdown-line", visible: true },
      { id: "data-convert", to: "/data-convert", label: "JSON/YAML/TOML", icon: "ri-arrow-left-right-line", visible: true },
      { id: "diff", to: "/diff", label: "文本 Diff", icon: "ri-swap-line", visible: true },
      { id: "jwt", to: "/jwt", label: "JWT 解析", icon: "ri-key-2-line", visible: true },
      { id: "url-codec", to: "/url-codec", label: "URL 编解码", icon: "ri-links-line", visible: true },
      { id: "code-minify", to: "/code-minify", label: "CSS / JS 压缩", icon: "ri-braces-line", visible: true },
      { id: "regex-tester", to: "/regex-tester", label: "正则测试器", icon: "ri-parentheses-line", visible: true },
      { id: "css-clamp", to: "/css-clamp", label: "Clamp 字号", icon: "ri-font-size", visible: true },
      { id: "base64-text", to: "/base64-text", label: "Base64 文本", icon: "ri-text-block", visible: true },
      { id: "color-converter", to: "/color-converter", label: "颜色转换器", icon: "ri-contrast-drop-line", visible: true }
    ]
  },
  {
    id: "seo",
    label: "SEO 发布工作台",
    tools: [
      { id: "seo-files", to: "/seo-files", label: "robots / sitemap", icon: "ri-road-map-line", visible: true },
      { id: "meta-tags", to: "/meta-tags", label: "HTML Meta", icon: "ri-meta-line", visible: true },
      { id: "og-image", to: "/og-image", label: "OG 图片", icon: "ri-image-add-line", visible: true }
    ]
  },
  {
    id: "system-files",
    label: "文件与网络工作台",
    tools: [
      { id: "links", to: "/links", label: "网站与文档", icon: "ri-bookmark-3-line", visible: true },
      { id: "ip-query", to: "/ip-query", label: "IP 查询", icon: "ri-router-line", visible: true },
      { id: "shared-disk", to: "/shared-disk", label: "共享连接", icon: "ri-hard-drive-3-line", visible: true },
      { id: "rename", to: "/rename", label: "文件重命名", icon: "ri-edit-2-line", visible: true },
      { id: "asset-manifest", to: "/asset-manifest", label: "资源清单", icon: "ri-file-list-3-line", visible: true },
      { id: "certificate-scan", to: "/certificate-scan", label: "证书扫描", icon: "ri-shield-check-line", visible: true }
    ]
  },
  {
    id: "assist",
    label: "开发者快捷工作台",
    tools: [
      { id: "timestamp", to: "/timestamp", label: "时间戳", icon: "ri-time-line", visible: true },
      { id: "uuid", to: "/uuid", label: "UUID", icon: "ri-fingerprint-line", visible: true },
      { id: "hash", to: "/hash", label: "Hash 生成", icon: "ri-shield-keyhole-line", visible: true },
      { id: "clipboard-history", to: "/clipboard-history", label: "剪贴板历史", icon: "ri-clipboard-line", visible: true },
      { id: "sticky-notes", to: "/sticky-notes", label: "桌面便签", icon: "ri-sticky-note-line", visible: true }
    ]
  },
  {
    id: "system",
    label: "系统",
    tools: [
      { id: "history", to: "/history", label: "历史记录", icon: "ri-history-line", visible: true },
      { id: "settings", to: "/settings", label: "设置", icon: "ri-settings-3-line", visible: true }
    ]
  }
];

const legacyDefaultGroupLabels: Record<string, string> = {
  images: "图片",
  media: "音视频",
  font: "字体",
  text: "文本与 CSS",
  seo: "SEO 与发布",
  "system-files": "文件与网络",
  assist: "开发辅助"
};

export const workbenchRoutes: Record<string, string> = {
  images: "/workbench/images",
  media: "/workbench/media",
  font: "/workbench/font",
  text: "/workbench/text",
  seo: "/workbench/seo",
  "system-files": "/workbench/system",
  assist: "/workbench/assist"
};

export function mergeGroups(saved: NavGroup[]) {
  const defaultGroupMap = new Map(defaultGroups.map((group) => [group.id, group]));
  const defaultToolMap = new Map(defaultGroups.flatMap((group) => group.tools.map((tool) => [tool.id, tool] as const)));
  const usedGroupIds = new Set<string>();
  const usedToolIds = new Set<string>();
  const merged: NavGroup[] = [];

  for (const savedGroup of Array.isArray(saved) ? saved : []) {
    const sourceGroup = defaultGroupMap.get(savedGroup.id);
    if (!sourceGroup || usedGroupIds.has(savedGroup.id)) continue;
    usedGroupIds.add(savedGroup.id);
    const tools: NavTool[] = [];
    for (const savedTool of Array.isArray(savedGroup.tools) ? savedGroup.tools : []) {
      const sourceTool = defaultToolMap.get(savedTool.id);
      if (!sourceTool || usedToolIds.has(savedTool.id)) continue;
      usedToolIds.add(savedTool.id);
      const label = savedTool.id === "shared-disk" && savedTool.label === "共享盘登录" ? sourceTool.label : savedTool.label || sourceTool.label;
      tools.push({ ...sourceTool, label, visible: savedTool.visible !== false });
    }
    const savedLabel = savedGroup.label?.trim();
    const label = !savedLabel || savedLabel === legacyDefaultGroupLabels[savedGroup.id]
      ? sourceGroup.label
      : savedLabel;
    merged.push({ ...sourceGroup, label, tools });
  }

  for (const defaultGroup of defaultGroups) {
    let targetGroup = merged.find((group) => group.id === defaultGroup.id);
    if (!targetGroup) {
      targetGroup = { ...defaultGroup, tools: [] };
      merged.push(targetGroup);
    }
    for (const sourceTool of defaultGroup.tools) {
      if (!usedToolIds.has(sourceTool.id)) {
        targetGroup.tools.push({ ...sourceTool });
        usedToolIds.add(sourceTool.id);
      }
    }
  }
  return merged;
}
export const navigationGroupsKey: InjectionKey<Readonly<Ref<NavGroup[]>>> = Symbol("navigationGroups");
