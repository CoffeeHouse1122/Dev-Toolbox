import { createRouter, createWebHashHistory } from "vue-router";

const lastRouteStorageKey = "dev-toolbox.last-tool-route.v1";

function getLastToolRoute() {
  try {
    const path = localStorage.getItem(lastRouteStorageKey);
    return path && path !== "/" ? path : "/favicon";
  } catch {
    return "/favicon";
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: () => getLastToolRoute() },
    { path: "/workbench/:id", component: () => import("../pages/WorkbenchPage.vue"), props: true },
    { path: "/favicon", component: () => import("../pages/FaviconTool.vue") },
    { path: "/svg-toolbox", component: () => import("../pages/SvgToolbox.vue") },
    { path: "/pwa-icons", component: () => import("../pages/PwaIconsTool.vue") },
    { path: "/webp", component: () => import("../pages/WebpTool.vue") },
    { path: "/woff2", component: () => import("../pages/FontWoff2Tool.vue") },
    { path: "/video-background", component: () => import("../pages/VideoBackgroundTool.vue") },
    { path: "/base64-image", component: () => import("../pages/Base64ImageTool.vue") },
    { path: "/video-animation", component: () => import("../pages/VideoAnimationTool.vue") },
    { path: "/sequence-animation", component: () => import("../pages/SequenceAnimationTool.vue") },
    { path: "/video-mute", component: () => import("../pages/VideoMuteTool.vue") },
    { path: "/video-compress", component: () => import("../pages/VideoCompressTool.vue") },
    { path: "/audio-compress", component: () => import("../pages/AudioCompressTool.vue") },
    { path: "/code-minify", component: () => import("../pages/CodeMinifyTool.vue") },
    { path: "/video-loop", component: () => import("../pages/VideoLoopTool.vue") },
    { path: "/markdown-export", component: () => import("../pages/MarkdownExportTool.vue") },
    { path: "/url-codec", component: () => import("../pages/UrlCodecTool.vue") },
    { path: "/timestamp", component: () => import("../pages/TimestampTool.vue") },
    { path: "/uuid", component: () => import("../pages/UuidTool.vue") },
    { path: "/rename", component: () => import("../pages/RenameTool.vue") },
    { path: "/shared-disk", component: () => import("../pages/SharedDiskTool.vue") },
    { path: "/image-compress", component: () => import("../pages/ImageCompressTool.vue") },
    { path: "/image-resize", component: () => import("../pages/ImageResizeTool.vue") },
    { path: "/image-crop", component: () => import("../pages/ImageCropTool.vue") },
    { path: "/watermark", component: () => import("../pages/WatermarkTool.vue") },
    { path: "/image-placeholder", component: () => import("../pages/ImagePlaceholderTool.vue") },
    { path: "/ip-query", component: () => import("../pages/IpQueryTool.vue") },
    { path: "/qr-code", component: () => import("../pages/QrCodeTool.vue") },
    { path: "/audio-convert", component: () => import("../pages/AudioConvertTool.vue") },
    { path: "/regex-tester", component: () => import("../pages/RegexTesterTool.vue") },
    { path: "/font-preview", component: () => import("../pages/FontPreviewTool.vue") },
    { path: "/font-subset", component: () => import("../pages/FontSubsetTool.vue") },
    { path: "/font-face", component: () => import("../pages/FontFaceGeneratorTool.vue") },
    { path: "/asset-manifest", component: () => import("../pages/AssetManifestTool.vue") },
    { path: "/seo-files", component: () => import("../pages/SeoFilesTool.vue") },
    { path: "/meta-tags", component: () => import("../pages/MetaTagsTool.vue") },
    { path: "/css-clamp", component: () => import("../pages/CssClampTool.vue") },
    { path: "/og-image", component: () => import("../pages/OgImageTool.vue") },
    { path: "/links", component: () => import("../pages/LinksTool.vue") },
    { path: "/jwt", component: () => import("../pages/JwtTool.vue") },
    { path: "/data-convert", component: () => import("../pages/DataConvertTool.vue") },
    { path: "/diff", component: () => import("../pages/DiffTool.vue") },
    { path: "/clipboard-history", component: () => import("../pages/ClipboardHistoryTool.vue") },
    { path: "/base64-text", component: () => import("../pages/Base64TextTool.vue") },
    { path: "/hash", component: () => import("../pages/HashTool.vue") },
    { path: "/color-converter", component: () => import("../pages/ColorConverterTool.vue") },
    { path: "/certificate-scan", component: () => import("../pages/CertificateScanTool.vue") },
    { path: "/capture-proxy", redirect: "/workbench/system" },
    { path: "/sticky-notes", component: () => import("../pages/StickyNotesTool.vue") },
    { path: "/history", component: () => import("../pages/HistoryPage.vue") },
    { path: "/settings", component: () => import("../pages/SettingsPage.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/workbench/text" }
  ]
});

router.afterEach((to) => {
  if (to.path && to.path !== "/") {
    localStorage.setItem(lastRouteStorageKey, to.path);
  }
});
