# Dev Toolbox

基于 Electron 43、Vue 3 和 TypeScript 的本地优先桌面工具箱，提供图片、音视频、字体、文本与样式、SEO、文件与网络及开发辅助工具。

主进程负责本地能力，preload 暴露受限 IPC，renderer 负责界面；沿用 `tsc + Vite + electron-builder` 构建链。开发约定见 [docs/AGENTS.md](docs/AGENTS.md)。

## 环境与启动

- Windows 10 / 11 x64。
- Node.js 22.14.0 或更高版本，且支持 Node-API 10；CI 和发布统一读取 `.nvmrc`。
- npm 10 或更高版本，只使用 npm 和 `package-lock.json`。

```powershell
git clone https://github.com/CoffeeHouse1122/Dev-Toolbox.git
cd Dev-Toolbox
npm ci
npm run dev
```

默认无需创建 `.env`。需调整开发代理或资源前缀时，参考 [.env.example](.env.example) 创建本地 `.env`；Electron 本地包的 `VITE_CDN_BASE` 保持 `./`。不要提交真实环境文件。

## 检查与打包

```powershell
npm run check           # 环境、类型、回归测试、Electron 冒烟及完整构建
npm run dist:win        # 生成 Windows x64 安装包并校验更新产物
```

安装包输出为 `release/Dev-Toolbox-版本号-x64.exe`，当前未签名。本地打包不会上传或发布。

按需使用：`npm test` 运行回归测试，`npm run build` 仅构建，`npm run pack` 生成目录包，`npm run verify:release` 校验已有发布产物。

## 发布到 GitHub

推送新的 `v*` 标签会触发 [Release Dev Toolbox](https://github.com/CoffeeHouse1122/Dev-Toolbox/actions/workflows/release.yml)，自动检查、打包并发布，无需手动创建 Release 或上传安装包。

先提交待发布代码，确认在 `main`、与远程同步且工作区干净。以下以 **0.1.7** 为例，后续发布统一替换版本号：

```powershell
npm version 0.1.7 --no-git-tag-version
git diff -- package.json package-lock.json
git status --short
git add -- package.json package-lock.json
git commit -m "发布 0.1.7 版本"
git tag -a v0.1.7 -m "发布 0.1.7 版本"
git push origin main
git push origin v0.1.7
```

按顺序执行，任一步失败先处理再继续。标签须与 `package.json` 版本一致，不重复创建或覆盖已发布标签。

当前标签推送会同时运行 **CI** 和 **Release Dev Toolbox**：前者只检查，后者才发布，不会重复发布安装包。

工作流成功后，在 [Releases](https://github.com/CoffeeHouse1122/Dev-Toolbox/releases) 确认三个文件齐全：

- `Dev-Toolbox-版本号-x64.exe`
- `Dev-Toolbox-版本号-x64.exe.blockmap`
- `latest.yml`

未完成发布的已有标签，可在 Actions → Release Dev Toolbox → Run workflow 填写 `release_tag` 重试；已发布版本请使用新版本号。

## 更新与数据

- 首次从 [Releases](https://github.com/CoffeeHouse1122/Dev-Toolbox/releases) 下载并安装 `.exe`。已打包的 Windows x64 版本启动后自动检查更新，下载和安装由用户确认；开发模式不启用更新。
- `0.1.5` 及更早的旧更新源版本需手动覆盖安装一次 `0.1.6` 或更高版本，无需先卸载。更新源固定为 GitHub Releases，客户端无需 Token。
- 便签、设置和历史记录保存在 Electron `userData`；升级前退出应用并备份该目录。目前无须手动执行数据库迁移，升级时不要删除数据目录。
- 曾使用旧版 HTTPS 抓包功能的用户，如已不再需要其证书，请自行在 Windows `certmgr.msc` 中移除受信任根证书 `NodeMITMProxyCA`；应用不会自动清理。
