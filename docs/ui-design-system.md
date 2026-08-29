# Material 3 / Material You 设计基线

Linmo Player 的界面遵循 Material 3 的层级、圆角、动态色和状态表达。这里的“Material You”指设计语言与个性化色彩方向，不要求第一版立即接入系统动态取色 API。

## 设计原则

- 移动端优先：单手可触达，底部导航承载一级导航；
- 内容优先：封面、歌名、艺术家和播放状态比装饰更重要；
- 表面分层：使用 `surface`、`surfaceContainer`、`surfaceContainerHigh` 表达层次，不依赖重阴影；
- 大圆角但不滥用：卡片 24dp，按钮 16dp，药丸标签 999dp；
- 状态清晰：播放中、同步中、无插件、失败和离线状态都必须有可读文案；
- 动效克制：优先使用 shared axis、fade through 和轻微缩放，避免干扰听歌。

## 第一版 token

| token | light value | 用途 |
| --- | --- | --- |
| `primary` | `#6750A4` | 主行动、选中状态 |
| `onPrimary` | `#FFFFFF` | 主色上的文字 |
| `secondaryContainer` | `#E8DEF8` | 次级操作背景 |
| `surface` | `#FFFBFE` | 页面背景 |
| `surfaceContainer` | `#F3EDF7` | 卡片与导航容器 |
| `surfaceContainerHigh` | `#ECE6F0` | 抬升的卡片、底部播放器 |
| `onSurface` | `#1D1B20` | 主文字 |
| `onSurfaceVariant` | `#49454F` | 次要文字 |
| `outline` | `#79747E` | 边界与分割 |

暗色主题只允许在主题层替换 token，组件不写死黑白背景。

## 页面结构

1. `Home`：欢迎区域、最近播放、推荐队列、当前播放；
2. `Library`：统一歌单、最近添加、离线数据；
3. `Plugins`：已安装/已启用/异常状态；当前应展示空状态；
4. `Settings`：播放、存储、隐私与实验性功能。

## 新手引导

首次启动使用三步 bottom sheet / dialog 引导：导入本地音乐 → 点击歌曲播放 → 了解插件是可选扩展。引导必须允许跳过，并将完成状态保存在设备本地；不能把新手引导变成强制注册或联网流程。

## 组件约定

- `AppBar`：标题 + 头像/设置入口；
- `FilterChip`：来源、排序和筛选；
- `FilledButton`：页面主行动；
- `ListItem`：歌曲与歌单的主要信息承载；
- `MiniPlayer`：固定在底部导航上方，点击进入 Now Playing；
- `EmptyState`：说明当前状态和唯一主行动，不用“暂无数据”结束对话。

## 无障碍

- 可点击区域不小于 48dp；
- 颜色不是表达状态的唯一方式；
- 播放、暂停、下一首等图标必须配置 accessibility label；
- 动效支持 reduced motion；
- 歌曲列表需要稳定的朗读顺序：标题 → 艺术家 → 来源 → 操作。
