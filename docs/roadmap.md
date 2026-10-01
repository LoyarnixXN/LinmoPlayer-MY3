# 项目路线图

## Phase 0 — 当前基线

- [x] 项目文档与目录结构
- [x] 统一歌曲/歌单模型
- [x] 插件契约、注册表和异常隔离抽象
- [x] Material 3 UI 基线（桌面端）

## Phase 1 — 桌面端本体可用

- [x] 本地音频文件/文件夹导入与基础播放
- [x] localStorage / userData 存储适配器
- [x] 播放队列与播放模式（顺序/列表循环/随机/单曲循环）
- [x] 进度记忆
- [x] 歌单创建、编辑与播放
- [x] Now Playing 与同步歌词
- [x] 系统媒体控制与桌面通知

## Phase 2 — 插件管理与运行时安全

- [x] 插件 manifest 校验
- [x] 权限声明与用户授权
- [x] 声明式 provider 运行时（不执行包内 JS）
- [x] 包完整性、版本兼容和回滚
- [x] 插件管理页面的导入/启用/停用/卸载流程

## Phase 3 — 第一个外部音源插件

- [x] GD Studio 多音源 provider
- [x] NeteaseCloudMusicApi 账号 provider
- [x] 多源聚合搜索与播放补全
- [x] 网易云扫码登录（内置声明式插件预置）

## Phase 4 — 多平台

- [x] 桌面壳适配
- [x] 复用 `packages/core`（esbuild vendor bundle）
- [x] 移动端 web 壳基线（`apps/mobile`）
- [ ] 完整跨平台壳（Android / iOS）
