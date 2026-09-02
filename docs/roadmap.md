# 项目路线图

## Phase 0 — 当前基线

- [x] 项目文档与目录结构
- [x] 统一歌曲/歌单模型
- [x] 插件契约、注册表和异常隔离抽象
- [x] Material 3 移动端 UI 基线
- [x] 真机音频适配器（expo-audio）

## Phase 1 — 本体可用

- [x] 本地音频文件导入与基础播放
- [ ] 播放队列、进度记忆和后台播放
- [x] AsyncStorage/设备文件存储适配器
- [ ] 歌单创建、编辑、排序与离线查看
- [ ] Now Playing、歌词容器和播放通知

## Phase 2 — 插件管理与运行时安全

- [x] 插件 manifest 校验
- [ ] 权限声明与用户授权
- [x] 声明式 provider 运行时（不执行包内 JS）
- [ ] 包完整性、版本兼容和回滚
- [x] 插件管理页面的导入/启用/停用/卸载流程

## Phase 3 — 第一个外部音源插件

- [x] GD Studio 多音源 provider
- [x] NeteaseCloudMusicApi 账号 provider

## Phase 4 — 多平台

- [x] 桌面壳适配
- [x] 复用 `packages/core`（esbuild vendor bundle）
- [ ] 跨端播放队列与本地数据迁移
