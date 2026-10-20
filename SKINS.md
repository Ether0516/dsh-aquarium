# 更换形象与维护动作

角色素材和动画数据独立于 DSH 的会话状态判断。通常只改 PNG 与 `skin.json`，然后构建、重启 DSH。

## 目录分工

| 文件 | 负责内容 |
| --- | --- |
| `assets/whale-girl-v2.png` | 原始透明精灵图 |
| `skins/whale-girl/skin.json` | 形象名、素材路径、网格、动作、速度和状态映射 |
| `scripts/skin-loader.cjs` | 自动发现样式、检查配置和嵌入素材 |
| `src/core.cjs` 的 `SpriteTimeline` | 通用播放与动作过渡 |
| `src/core.cjs` 的 `TurnActivity`、`src/controllers.cjs` | DSH 当前会话事件与状态判断 |
| `src/client.cjs`、`src/pet.css` | 通用 Canvas 展示和设置页 |

## 替换默认形象

1. 准备带 alpha 通道的 RGBA 或灰度加 alpha PNG。每个姿势在一格中，角色比例一致，四周留出透明区域。
2. 把新素材放在项目中，修改 `skins/whale-girl/skin.json` 的 `image`；路径相对于该 JSON 所在目录。
3. 根据新素材更新 `grid` 和动作帧序。帧号从 0 开始，按从左到右、从上到下排列。
4. 在插件目录执行 `npm run build`、`npm test`，完全退出并重新打开 DSH。

若仍使用同一个 `id`，现有用户的样式选择会继续有效。显示名称可修改 `name`。

## 添加可选样式

复制 `skins/whale-girl` 为新的目录，例如 `skins/robot`。把新素材放在 `assets/robot.png`，修改复制的 JSON：

```json
{
  "id": "robot",
  "name": "小机器人",
  "image": "../../assets/robot.png"
}
```

以上是需要修改的字段，保留并适配原配置的其余字段。`id` 必须唯一，只能使用小写字母、数字、下划线和连字符。重新构建后，设置页会自动出现「桌宠样式」选择框。不同样式可使用不同网格、动作名称、逻辑像素尺寸和播放速度。

## 当前素材的帧号

| 行 | 帧号 | 姿势 |
| --- | --- | --- |
| 1 | 0、1、2、3 | 站姿、闭眼、呼吸、站姿 |
| 2 | 4、5、6、7 | 思考 |
| 3 | 8、9、10、11 | 挥手与庆祝 |
| 4 | 12、13、14、15 | 拿扳手工作 |

不同状态可以共用姿势，通过次序、重复帧和间隔改变节奏；不需要为每个状态重新画整组动作。

## 动作配置

`actions` 定义可播放的动作，`states` 把八种 DSH 状态映射到动作名。例如新增一个休息动作：

```json
"actions": {
  "sleep": { "frames": [1, 1, 0, 1], "ms": 420 }
}
```

把这个条目加入现有 `actions`，再将 `states.offline` 改为 `"sleep"`，断线时就会播放新动作。需要新的姿势时，将姿势加入精灵图、更新网格，再引用新帧号。

| 字段 | 含义 |
| --- | --- |
| `frames` | 播放顺序，允许重复；所有帧号必须在网格范围内 |
| `ms` | 每帧停留毫秒数，范围 40–2000；像素风通常可用 150–450 |
| `once: true` | 播放一遍后停在 `neutralFrame`，例如完成庆祝 |
| `neutralFrame` | 一次性动作结束后的站姿 |
| `transition.frames` | 切换动作时的过渡姿势，默认放下手并回到站姿 |
| `transition.ms` | 过渡帧间隔 |

状态键固定为 `idle`、`thinking`、`generating`、`tool`、`waiting`、`complete`、`error`、`offline`。八个状态都要有映射，但可以指向同一个动作。动作名可以任意新增；如果要新增一种独立的触发事件，例如每天晚上睡觉，还需要扩展状态判断和触发逻辑。

## 网格与像素对齐

| 字段 | 含义 |
| --- | --- |
| `grid.columns` / `rows` | 列数和行数，各最多 32，总格数最多 256 |
| `rendering.logicalSize` | Canvas 逻辑边长，32–128，默认 64 |
| `rendering.height` | 角色在逻辑 Canvas 中的最大高度，默认 54 |
| `rendering.baseline` | 脚底所在的逻辑纵坐标，默认 60 |
| `rendering.anchor` | `head` 按上半身重心对齐，`center` 按整个轮廓中心对齐 |
| `rendering.alphaThreshold` | 分析轮廓时的 alpha 阈值，默认 192 |

均匀网格只需要 `columns` 和 `rows`；图片尺寸不能整除网格时也能读取。若生成素材的行距或列距不均匀，可指定源 PNG 的像素边界，例如当前素材：

```json
"grid": {
  "columns": 4,
  "rows": 4,
  "rowEdges": [0, 334, 648, 960, 1254]
}
```

边界数组从 0 开始，严格递增，长度为行数或列数加 1，最后一个值等于 PNG 的高度或宽度。列边界字段为 `columnEdges`。这些字段只控制读取区域，源 PNG 保持原样；换成规则的新精灵图时可删掉边界数组。

播放器统一缩放各帧，按轮廓对齐头部与脚底。构建会检查状态引用、帧号、网格边界、重复样式 ID 和 PNG alpha，错误会明确指出对应样式。

## 打包

确认预览后执行 `npm run pack:local`。输出在 `dist/`，包内保留维护所需的素材、配置、源码、构建脚本和测试。新增素材若放在 `assets/` 中会自动包含；放在其他目录时应相应更新 `package.json` 的 `files`。
