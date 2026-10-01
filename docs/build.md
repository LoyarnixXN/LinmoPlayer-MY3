# 构建与测试

## 环境要求

### Windows

- Windows 10/11；
- Node.js 20+；
- npm 可以访问 npm registry。

桌面端使用 Electron，支持本地音频文件/文件夹导入、在线搜索与播放、歌词、歌单和插件管理；所有网络请求经由主进程代理发出。

## 安装依赖

在项目根目录执行：

```powershell
npm install
```

## 调试运行

```powershell
npm run start:windows
```

## renderer 应用包构建

`apps/desktop/renderer/app.js` 是由 esbuild 打包的应用包（包含 `packages/core`）。修改 `apps/desktop/src/` 或 core 源码后需要重新构建：

```powershell
npm run build:renderer --workspace @linmo/desktop
```

## 安装包构建

生成 Windows 安装包和便携版：

```powershell
npm run build:windows
```

产物位于 `dist/windows/`，包括 NSIS 安装程序和 portable 可执行文件。

仅打包目录（不生成安装程序）：

```powershell
npm run pack:windows
```

安装包冒烟测试（静默安装 + 启动/停止）：

```powershell
npm run test:installer
```

### 网络受限时（GitHub 不可达）

electron-builder 下载 Electron / NSIS 可能超时，可改用 npmmirror：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run build:windows
```

## 当前测试边界

当前可以验证导航、Material 3 视觉与动效、本地文件/文件夹导入、播放控制、在线搜索与多源补全播放、歌词、网易云登录与歌单同步、主题/字体插件应用和插件清单管理。

首次打开会显示三步新手引导：导入音乐、播放歌曲、了解插件扩展。引导完成或跳过后会保存在本地；可在设置中重新查看。

插件中心支持清单导入、能力展示、启用/停用和卸载；插件 ZIP 不执行任意代码，音源插件只映射到宿主内置 provider。
