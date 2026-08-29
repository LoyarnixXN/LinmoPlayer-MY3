# 构建与测试

## 环境要求

### Android

- Node.js 20+；
- Android Studio、Android SDK、`adb`；
- JDK 17+；
- 真机开启 USB 调试，或准备 Android Emulator。

本项目也提供 EAS 云构建配置。EAS 构建不要求本机安装完整 Android SDK，但需要登录 Expo 账号，并首次执行 `eas init` 绑定项目。

### Windows

- Windows 10/11；
- Node.js 20+；
- npm 可以访问 npm registry。

Windows 桌面端使用 Electron，支持选择本地音频文件并通过 HTML Audio 播放；后台播放和系统媒体控制仍按路线图后续接入。

## 安装依赖

在项目根目录执行：

```powershell
npm install
```

## Android

### 调试运行

```powershell
npm run start:android
```

在 Expo CLI 中按提示打开 Android Emulator，或用 Expo Go 扫描二维码。

### 云构建 APK

```powershell
npm install -g eas-cli
cd apps/mobile
eas login
eas init
eas build --platform android --profile preview
```

`preview` profile 输出可直接安装的 APK。正式发布使用：

```powershell
eas build --platform android --profile production
```

### 本地原生构建

完成 Android SDK 配置后：

```powershell
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android
```

## Windows

```powershell
npm run start:windows
```

生成 Windows 安装包和便携版：

```powershell
npm run build:windows
```

产物位于 `dist/windows/`，包括 NSIS 安装程序和 portable 可执行文件。

## 当前测试边界

当前可以验证导航、Material 3 视觉层级、本地文件导入、播放/暂停和插件清单管理。移动端需要在真机或模拟器上选择音频文件；Windows 可直接选择本机音频文件。

首次打开会显示三步新手引导：导入音乐、点击歌曲播放、了解插件扩展边界。引导完成或跳过后会保存在本地；Windows 可清除应用本地存储后重新查看，Android 可清除应用数据后重新查看。

当前插件中心支持插件清单导入、能力展示、启用/停用和卸载；具体平台适配器、插件动态执行和歌单网络同步将按安全边界继续接入。本地导入的文件目前只保存在当前运行会话中，下一阶段再接入本地数据库和持久化索引。
