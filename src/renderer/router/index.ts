import { createRouter, createWebHashHistory } from "vue-router";
import FaviconTool from "../pages/FaviconTool.vue";
import WebpTool from "../pages/WebpTool.vue";
import FontWoff2Tool from "../pages/FontWoff2Tool.vue";
import VideoBackgroundTool from "../pages/VideoBackgroundTool.vue";
import Base64ImageTool from "../pages/Base64ImageTool.vue";
import VideoAnimationTool from "../pages/VideoAnimationTool.vue";
import VideoMuteTool from "../pages/VideoMuteTool.vue";
import MarkdownExportTool from "../pages/MarkdownExportTool.vue";
import UrlCodecTool from "../pages/UrlCodecTool.vue";
import TimestampTool from "../pages/TimestampTool.vue";
import UuidTool from "../pages/UuidTool.vue";
import RenameTool from "../pages/RenameTool.vue";
import ImageCompressTool from "../pages/ImageCompressTool.vue";
import ImageResizeTool from "../pages/ImageResizeTool.vue";
import SharedDiskTool from "../pages/SharedDiskTool.vue";
import HistoryPage from "../pages/HistoryPage.vue";
import SettingsPage from "../pages/SettingsPage.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/favicon" },
    { path: "/favicon", component: FaviconTool },
    { path: "/webp", component: WebpTool },
    { path: "/woff2", component: FontWoff2Tool },
    { path: "/video-background", component: VideoBackgroundTool },
    { path: "/base64-image", component: Base64ImageTool },
    { path: "/video-animation", component: VideoAnimationTool },
    { path: "/video-mute", component: VideoMuteTool },
    { path: "/markdown-export", component: MarkdownExportTool },
    { path: "/url-codec", component: UrlCodecTool },
    { path: "/timestamp", component: TimestampTool },
    { path: "/uuid", component: UuidTool },
    { path: "/rename", component: RenameTool },
    { path: "/shared-disk", component: SharedDiskTool },
    { path: "/image-compress", component: ImageCompressTool },
    { path: "/image-resize", component: ImageResizeTool },
    { path: "/history", component: HistoryPage },
    { path: "/settings", component: SettingsPage }
  ]
});
