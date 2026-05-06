# Electron 项目结构说明

这份结构说明可直接复用到新的 Electron 项目，也可以摘录到团队约束文档中。

## 推荐目录

```txt
build/
  icons/                Electron 打包图标、安装包图标、托盘图标源文件
docs/                   架构、目录规范、发布说明等文档
src/
  electron/
    main/               主进程入口、窗口创建、IPC 注册、原生能力封装
      services/         文件、图片、音视频、系统能力等 Node/Electron 服务
      utils/            主进程路径、平台判断、公共工具
      types/            仅供主进程使用的声明文件
    preload/            contextBridge 白名单 API，对渲染进程暴露安全能力
  renderer/
    assets/             渲染层静态资源
    components/         通用 UI 组件
    pages/              路由页面或工具页面
    router/             路由定义
    stores/             状态管理
    styles/             全局样式和主题
  shared/               main、preload、renderer 共享的类型和协议
dist/                   编译产物
release/                安装包与分发产物
```

## 目录约束

- build 只放打包期需要的资源，不放业务源码。
- src/electron/main 只处理系统能力、窗口生命周期、IPC 和本地文件操作，不写 Vue 视图逻辑。
- src/electron/preload 只暴露经过筛选的 API，不直接把 ipcRenderer 整体透传给 renderer。
- src/renderer 只负责界面、交互和状态，不直接依赖 Node.js API。
- src/shared 只放无副作用的类型、协议、常量，避免耦合到具体运行时。
- docs 用来沉淀可复用规则，README 只保留快速启动和概览。

## 图标资源建议

- Windows 安装包和 exe 使用 build/icons/favicon.ico。
- Linux 图标使用 build/icons/favicon-256x256.png。
- 如果应用存在托盘图标或运行时窗口图标，也统一从 build/icons 或打包后的 resources/icons 读取。

## 适用场景

- 本地工具类桌面应用
- 需要文件系统、剪贴板、ffmpeg、图片处理等原生能力的 Electron 项目
- 需要同时维护主进程、预加载层和前端界面的中大型桌面应用