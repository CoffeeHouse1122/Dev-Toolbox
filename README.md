# Dev Toolbox

基于 Electron 43、Vue 3 和 TypeScript 的本地优先桌面工具箱，提供图片、音视频、字体、文本与样式、SEO、文件与网络及开发辅助工具。

侧栏点击分类标题（含箭头、名称和数量）展开或收起工具，点击右侧面板图标进入分类总览，悬停可查看分类提示；展开状态与页面切换独立。置顶、系统与分类标题对齐，不设置总览入口。总览与侧栏共用名称、排序和可见性配置，置顶和自定义导航继续保留。

主进程负责本地能力，preload 暴露受限 IPC，renderer 负责界面；沿用 `tsc + Vite + electron-builder` 构建链。开发约定见 [docs/AGENTS.md](docs/AGENTS.md)。

目录失效、操作失败等临时反馈统一使用浮层 toast，不挤占页面空间；目录提醒支持重新选择和关闭后忽略。表单实时校验、任务进度、批量失败明细及可展开的任务日志仍保留在对应区域。

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

## 构建与打包

以下输出目录以 Windows x64 为例：

| 命令 | 用途 | 输出目录 |
| --- | --- | --- |
| `npm run build` | 编译主进程、preload 和共享代码，构建 renderer | `dist/` |
| `npm run check` | 检查环境、类型，运行回归测试及 Electron 冒烟，完成构建 | `dist/` |
| `npm run pack` | 构建并生成当前平台免安装目录包 | `release/win-unpacked/` |
| `npm run dist:win:dir` | 构建并生成 Windows x64 免安装目录包 | `release/win-unpacked/` |
| `npm run dist` | 构建并生成当前平台安装包 | `release/` |
| `npm run dist:win` | 构建并生成 Windows x64 NSIS 安装包，校验更新产物 | `release/` |
| `npm run verify:release` | 校验已有安装包、更新清单及包内容，需先完成打包 | 不生成新产物，读取 `release/` |

`dist/` 下包含 `electron/`、`shared/` 和 `renderer/`。目录包可直接运行其中的 `Dev Toolbox.exe`，无需安装；`npm run build` 本身不会生成可独立运行的安装包。

本地打包不会上传或发布。安装包为 `release/Dev-Toolbox-版本号-x64.exe`，当前未签名。发布前执行 `npm run check`；仅运行回归测试可用 `npm test`。

构建后可用 `npm run test:workspace-ui` 验证共享连接布局、确认弹窗和链接卡片；测试使用隔离数据及模拟共享，不会操作真实 Windows 连接。

## 发布到 GitHub

推送新的 `v*` 标签会触发 [Release Dev Toolbox](https://github.com/CoffeeHouse1122/Dev-Toolbox/actions/workflows/release.yml)，自动检查、打包并发布，无需手动创建 Release 或上传安装包。

先提交待发布代码，确认在 `main`、与远程同步且工作区干净。以下以 **0.1.8** 为例，后续发布统一替换版本号：

```powershell
npm version 0.1.8 --no-git-tag-version
git diff -- package.json package-lock.json
git status --short
git add -- package.json package-lock.json
git commit -m "发布 0.1.8 版本"
git tag -a v0.1.8 -m "发布 0.1.8 版本"
git push origin main
git push origin v0.1.8
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
- Windows 共享连接使用 `\\server\share` 格式，可选当前 Windows 身份或指定账号；仅勾选“记住凭据”才在应用内加密保存密码。旧 HTTP 形式的配置会转换为 SMB 路径，旧明文密码需重新输入；不再提供无盘符的“持久连接”。“忘记凭据”只清除应用副本，旧版写入 Windows 凭据管理器的记录需自行管理。
- 曾使用旧版 HTTPS 抓包功能的用户，如已不再需要其证书，请自行在 Windows `certmgr.msc` 中移除受信任根证书 `NodeMITMProxyCA`；应用不会自动清理。
- 共享页会识别资源管理器已有的 SMB 会话，底部主按钮在已连接时为“打开目录”（沿用现有会话、不提交表单凭据），未连接时为“连接并打开”。如需更换账号，请先关闭文件并自行断开该服务器的旧会话，避免 1219 冲突；应用不会自动清理其他连接。
- 共享状态不定时轮询：进入页面、切回应用、修改路径及连接操作后检查；也可手动刷新。打开已有共享前仍会重新校验连接。
