# Dev Toolbox

Dev Toolbox 是面向前端开发、兼顾全栈调试的本地优先 Electron 工具箱。它把图片、音视频、字体、文本与样式、SEO、文件与网络、开发辅助能力组织为七个工作台；所有工具均可直接打开，处理数据默认留在本机。

## 技术架构

- Electron 43：窗口生命周期、文件系统、SQLite、FFmpeg、Sharp 与网络能力。
- Vue 3、TypeScript、Vite、Vue Router、Pinia、GSAP：renderer 界面、路由、状态和动画。
- preload：通过 `contextBridge` 暴露按业务命名的最小 API，不向 renderer 暴露 Node.js 或原始 `ipcRenderer`。
- shared：main、preload、renderer 共用的 TypeScript 契约。
- 本地数据：便签使用 `better-sqlite3`，历史记录沿用 `sql.js`；设置和工具配置使用原子 JSON 写入。
- 媒体能力：`sharp`、`ffmpeg-static`、`pdf-lib`、`fonteditor-core`、`wawoff2`。

项目沿用现有的 `tsc + Vite + electron-builder` 构建链，main、preload、renderer 分别输出到 `dist/electron` 与 `dist/renderer`。当前不迁移到 electron-vite，避免在功能修复中同时改写已经稳定的主进程和 preload 构建边界。Electron 43 自带现代 Chromium，因此不引入 legacy plugin；renderer 生产资源统一输出到 `static/`。

## 环境要求

- Windows 10 / 11（共享盘和安装更新目前为 Windows 能力）。
- Node.js 22.14.0 或更高版本，且支持 Node-API 10；CI 和发布工作流统一读取 `.nvmrc`。
- npm 10 或更高版本，只使用 npm 和 `package-lock.json`。
- 安装依赖时需允许 `electron-builder install-app-deps` 重建原生模块。

`better-sqlite3` 需要 Node-API 10，旧版 Node 22.12.0 会导致便签测试进程崩溃。安装依赖、执行 `npm test` 或 `npm run check` 时会先检查运行环境；也可执行 `npm run check:runtime` 单独检查。

```bash
npm install
```

## 环境配置

复制 `.env.example` 为本地 `.env`，真实 `.env` 不提交 Git。

- `VITE_CDN_BASE`：renderer 生产资源前缀。Electron 本地包保持 `./`；若使用远程 CDN，还必须同步调整 CSP。
- `VITE_API_PROXY_TARGET`：Vite 开发环境 `/api`、`/media` 的代理目标，默认 `http://localhost:3000`。

桌面更新固定使用公开仓库 [CoffeeHouse1122/Dev-Toolbox Releases](https://github.com/CoffeeHouse1122/Dev-Toolbox/releases)。更新源由 `package.json` 的 `build.publish` 配置，打包时生成 `resources/app-update.yml`。客户端不需要 GitHub Token，也不再读取 `DESKTOP_APP_UPDATE_URL`、`AUTOUPDATE_FEED_URL` 或旧 `update-config.json`；已有 `.env` 中的旧更新变量可以移除。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动 renderer 与 Electron，启用开发热更新 |
| `npm run dev:renderer` | 仅启动 Vite renderer |
| `npm run dev:electron` | 等待 renderer，监视 main/preload/shared 并自动重启 Electron |
| `npm run build` | 构建 main、preload 和 renderer |
| `npm run build:main` | 构建 main 与 preload |
| `npm run build:renderer` | 构建 renderer |
| `npm run typecheck` | 执行主进程和 renderer 类型检查 |
| `npm test` | 构建主进程并执行 Node 回归测试 |
| `npm run test:electron` | 执行真实 Electron/Sharp/中文字体冒烟测试 |
| `npm run check` | 聚合类型检查、测试、Electron 冒烟和完整构建 |
| `npm run pack` | 生成当前平台目录包 |
| `npm run dist` | 生成当前平台安装包 |
| `npm run dist:win` | 生成 Windows x64 NSIS 安装包并校验更新产物，不上传 |
| `npm run verify:release` | 校验安装包、更新清单、SHA-512、应用入口和 GitHub 更新源 |

开发模式下，renderer 修改由 Vite HMR 直接更新当前窗口，不重启桌面进程；`src/electron`、`src/shared` 或 `tsconfig.node.json` 修改会先重新编译 main/preload，编译成功后自动重启 Electron。编译失败时保留上一次正常运行的桌面进程，修复并保存后会再次构建。依赖、`package.json` 或环境变量变化仍需重新执行 `npm run dev`。按 `Ctrl+C` 会同时清理 Vite、Electron 及其子进程。

## 项目结构

```text
build/                       打包图标和安装资源
docs/                        项目约束与架构文档
src/
  electron/
    main/
      services/              文件、媒体、网络、持久化等原生能力
      utils/                 主进程通用工具
    preload/                 contextBridge 白名单
  renderer/
    assets/                  renderer 静态资源
    components/              通用界面组件
    pages/                   工具页面和工作台
    router/                  懒加载路由
    stores/                  跨页面状态
    styles/                  设计 token 与全局样式
  shared/                    跨进程契约与纯函数
tests/                       文件安全、便签、更新器和编码回归测试
```

开发与审查遵守 [docs/AGENTS.md](docs/AGENTS.md)。源码使用 UTF-8；`.editorconfig` 与 `.gitattributes` 统一 LF，Windows 脚本保留 CRLF。

## 数据、备份与迁移

运行数据位于 Electron `userData`，不写入安装目录或源码目录。配置和数据库写入采用临时文件、flush、原子替换及备份恢复；便签在窗口关闭、重载和安装更新前执行保存屏障。

当前没有需要人工执行的数据库迁移命令。既有本地数据库由对应 service 以兼容方式初始化；升级前应备份 `userData`。如果后续引入独立、版本化 migration，需同时增加 `db:revision`、`db:migrate` 和 `db:status` 命令。

从 `0.1.5` 及更早的 JSON 更新源版本迁移时，需要从 GitHub Releases 手动下载并覆盖安装一次 `0.1.6` 或更高版本。应用标识、名称和 `userData` 目录保持不变，不需要卸载或删除便签、设置、历史记录。旧版不会自动识别 GitHub 的 `latest.yml`，旧服务器无需发布过渡清单。

从包含抓包工具的旧版本升级时，应用不会删除 `userData` 中遗留的 CA 文件，也不会修改操作系统证书。若曾启用 HTTPS 抓包，请在确认不再依赖后，通过 Windows `certmgr.msc` 的“受信任的根证书颁发机构 / 证书”手动移除 `NodeMITMProxyCA`；遗留 CA 目录也只由用户自行清理。

## 源码传播、终端与离线保全

日常获取和可重复安装使用 Git 与 lockfile，不复制已有 `node_modules`：

```bash
git clone https://github.com/CoffeeHouse1122/Dev-Toolbox.git
cd Dev-Toolbox
npm ci
npm run check
```

发布源码快照时，先创建版本 tag，再生成不含依赖和构建产物的归档；完整历史另存为 Git bundle。两者都可以通过任意文件服务器、移动硬盘或网盘传播：

```bash
git archive --format=zip --output=Dev-Toolbox-source.zip HEAD
git bundle create Dev-Toolbox.bundle --all
```

bundle 恢复使用 `git clone Dev-Toolbox.bundle Dev-Toolbox`。Windows PowerShell 用 `Get-FileHash .\Dev-Toolbox-source.zip -Algorithm SHA256`，macOS 用 `shasum -a 256 ./Dev-Toolbox-source.zip`，Linux 用 `sha256sum ./Dev-Toolbox-source.zip` 校验归档；发布时把校验值与文件分开保存。源码由 `.editorconfig` 与 `.gitattributes` 强制 UTF-8/LF，PowerShell、Windows Terminal、bash 和 CI 使用同一份 npm 脚本。批处理默认不覆盖源文件，任务产物采用临时文件提交，并保留 source map 或原始到输出的映射。

## 安全边界

- renderer 启用 `contextIsolation`、sandbox、CSP，并禁用 Node 集成。
- IPC payload 使用 Zod 或显式边界校验；文件名进行 Unicode NFC 和 Windows 安全处理。
- 外部导航和新窗口默认禁止；显式外链仅允许 HTTP、HTTPS 和邮件协议。
- 便签富文本在 main 与 renderer 双层净化，ZIP 导入限制条目数、声明大小和实际解压体积。
- 批量任务先写临时产物再独占提交；批量重命名支持 dry-run、冲突预检、两阶段执行和失败回滚。

## 验证与打包

```powershell
npm run check
npm run dist:win
```

本地打包不会发布。安装包为 `Dev-Toolbox-版本号-x64.exe`，当前使用未签名发布。

## 发布到 GitHub

推送新的 `v*` 标签会触发 [Release Dev Toolbox](https://github.com/CoffeeHouse1122/Dev-Toolbox/actions/workflows/release.yml) 工作流，自动检查、构建并发布 Windows x64 安装包及更新文件，无需手动创建 Release。

先提交本次发布的代码，确认当前位于 `main`、已与远程同步且工作区干净。以下以发布下一版 **0.1.7** 为例，发布其他版本时统一替换版本号：

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

按顺序执行，任一步失败应先处理再继续。标签须与 `package.json` 版本一致，不覆盖已发布的标签。当前 `0.1.6` 的版本文件已提交，发布该版本时可直接从 `git tag` 开始，并将版本号改为 `0.1.6`。

工作流成功后，在 [Releases](https://github.com/CoffeeHouse1122/Dev-Toolbox/releases) 确认以下三个文件齐全：

- `Dev-Toolbox-版本号-x64.exe`
- `Dev-Toolbox-版本号-x64.exe.blockmap`
- `latest.yml`

未完成发布的已有标签可在 Actions → Release Dev Toolbox → Run workflow 中填写 `release_tag` 重试。

## 按需检查

```powershell
npm test                 # 回归测试，包含更新流程
npm run verify:release   # 校验 release/ 中完整的安装包、更新清单和包目录
```

应用启动后自动检查更新，下载和安装由用户确认。发布后用两个已安装版本验证升级及便签、设置、历史记录保留。

下载页的 `download/release-manifest.json` 仅供页面展示；需要同步版本与日志时手动更新并重新部署，不影响应用内更新。

构建产物、安装包、依赖目录、真实环境文件、数据库、日志和临时文件均由 `.gitignore` 排除，不应提交 Git。
