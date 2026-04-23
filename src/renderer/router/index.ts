import { createRouter, createWebHashHistory } from "vue-router";
import FaviconTool from "../pages/FaviconTool.vue";
import WebpTool from "../pages/WebpTool.vue";
import FontWoff2Tool from "../pages/FontWoff2Tool.vue";
import VideoBackgroundTool from "../pages/VideoBackgroundTool.vue";
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
    { path: "/history", component: HistoryPage },
    { path: "/settings", component: SettingsPage }
  ]
});

