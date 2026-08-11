const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
app.disableHardwareAcceleration();

const history = {
  async startTask() {},
  async finishTask() {}
};

app.whenReady().then(async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-electron-smoke-"));
  try {
    const { generateOgImage } = require("../dist/electron/main/services/og-image.service.js");
    const result = await generateOgImage(
      {
        outputDir,
        fileName: "中文社交卡片",
        title: "前端工具箱",
        subtitle: "中文字体跨平台渲染检查",
        siteName: "Dev Toolbox",
        width: 640,
        height: 336,
        backgroundColor: "#0d1117",
        accentColor: "#2f81f7",
        textColor: "#f0f6fc"
      },
      history
    );
    assert.equal(result.status, "success", result.errorMessage);
    assert.equal(result.files.length, 1);
    assert.match(path.basename(result.files[0]), /^中文社交卡片(?:-\d+)?\.png$/u);
    const stat = await fs.stat(result.files[0]);
    assert.ok(stat.size > 1_000, "rendered OG image should not be empty");
    console.log("Electron smoke: embedded CJK font and Sharp rendering passed.");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
