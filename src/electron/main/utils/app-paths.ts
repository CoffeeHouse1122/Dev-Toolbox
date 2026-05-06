import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

function getDistRoot() {
  return path.resolve(__dirname, "../../..");
}

export function getPreloadEntryPath() {
  return path.resolve(__dirname, "../../preload/index.js");
}

export function getRendererIndexPath() {
  return path.join(getDistRoot(), "renderer", "index.html");
}

export function getBuildResourcePath(...segments: string[]) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }

  return path.join(app.getAppPath(), "build", ...segments);
}

export function getRuntimeIconPath() {
  const candidates = process.platform === "linux"
    ? [
        getBuildResourcePath("icons", "favicon-256x256.png"),
        getBuildResourcePath("icons", "favicon.ico")
      ]
    : [
        getBuildResourcePath("icons", "favicon.ico"),
        getBuildResourcePath("icons", "favicon-256x256.png")
      ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}