# B站收藏夹备份（磨砂玻璃 UI）

一个 Tampermonkey / Violentmonkey 用户脚本，运行在 B 站空间收藏页，把收藏夹里的视频逐条扫出来，为每一条尽量补全**标题 + 封面**，标出失效条目，最后导出一份单文件 HTML 备份。

当前版本：**v1.0.5** ｜ 运行页面：`https://space.bilibili.com/*/favlist*`

## 功能

- **面板**：右下角「收藏备份」悬浮按钮（可拖动，位置记在 `GM_setValue`），点开是 780×820 的磨砂玻璃面板，最小化后高度压到 60px。窗口宽度不足 1000px 时自适应为 92vw / 86vh。
- **收藏夹列表**：调 `fav/folder/created/list-all?up_mid=`，列出当前空间主人的收藏夹及其封面、条数。
- **逐夹扫描**：`fav/resource/list` 串行翻页（每页 20/30/50 可选），每页之间带随机延迟，条与条之间也停 80~160ms。
- **多源补全**：对每个视频依次尝试 4 类来源取标题与封面，任一成功即可；结果按 `source` 标注，可逐条在下拉里切换。
- **失效标记**：官方 `view` 接口拿不到标题时标「已失效」，「只看失效」可单独筛出这些条目。
- **两种视图**：分组列表（封面 / 标题 / 状态 / UP 主 / BV 号 / 双下拉）和封面墙（三栏瀑布流，点卡片跳视频页）。
- **搜索**：按标题或 UP 主名即时过滤。
- **导出 HTML**：单文件，含备份时间、收藏夹分组、每条的视频信息与全部来源版本，双击即可打开。

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 新建脚本，把 [`bilibili-fav-backup.user.js`](./bilibili-fav-backup.user.js) 整份粘贴保存；或直接把 raw 地址交给 Tampermonkey 的「从 URL 安装」。
3. 打开自己的收藏页 `https://space.bilibili.com/<你的UID>/favlist`，右下角出现「收藏备份」按钮。

## 使用

点开按钮 → 面板自动拉取收藏夹列表 → 勾选要扫的收藏夹 → 设置每页条数与延迟 → 开始扫描。

扫描过程中会实时显示进度条与当前处理到的条目；全部结束后可切「封面墙 / 只看失效」、搜索、或用「导出 HTML」保存。

「导出 HTML」的文件名形如 `bili_fav_backup_<时间戳>.html`，导出的是**当前全部结果**（不受搜索/筛选影响）。

## 数据来源

| 来源 | 实际请求 | 取到的字段 |
| --- | --- | --- |
| official | `api.bilibili.com/x/web-interface/view?bvid=/aid=` | title、pic |
| biliplus | `www.biliplus.com/video/<bvid>` 的页面 HTML | `__INITIAL_STATE__` 里的 title、pic |
| jijidown | `api.biliplus.ipcjs.top/x/web-interface/view`、`jiji.moe/api/v1/video` | title、pic |
| beibei | `xbeibeix.com` / `beibeigame.com` / `bbdownloader.com` 的 `/video/<bvid>` | 页面里的 h5 标题、封面 img |
| cached | `GM_getValue('cached_vid_<bvid\|aid>')` | title、cover |

每个来源最多重试 1 次（共 2 次尝试），单请求超时 15 秒；要求至少有标题或封面才算拿到结果。

## 本地存储

| 键 | 用途 |
| --- | --- |
| `backup_btn_pos_v104` | 悬浮按钮坐标 |
| `fav_last_time_<收藏夹ID>` / `fav_last_count_<收藏夹ID>` | 增量游标（上次最大收藏时间、上次条数） |
| `sel_<bvid\|aid>` | 该条选中的标题/封面来源 |
| `cached_vid_<bvid\|aid>` | 缓存来源读取（见下） |

## 已知问题（按代码实际行为整理，非猜测）

- **只覆盖「我创建的」收藏夹**：接口用的是 `folder/created`，别人的收藏合集不在列表里。
- **失效判定偏激进**：`invalid = 官方 view 拿不到标题 / 标题为空 / 标题含「失效」`。网络超时、被限流、接口抖动都会被标成「已失效」。
- **`cached` 来源恒为空**：全脚本只有 `GM_getValue` 读这个键，**没有任何写入**，所以这一路永远不会命中。
- **增量模式不是「只抓新页」**：仍然先把所有页拉完，再按 `fav_time` / 条数过滤，翻页成本不变。
- **版本下拉里的时间没有意义**：各来源的 `time` 都是抓取瞬间的 `Date.now()`，不是发布时间，所以「最早可用 / 最新可用」排序等于抓取顺序。
- **来源选择不持久**：会写 `sel_<bvid|aid>`，但渲染时没有读回，刷新后回到默认。
- **导出的 HTML 不离线**：封面是 CDN 外链，源站删图或防盗链就会显示不出来。
- **面板本身不可拖动**：只有右下角那个启动器按钮能拖，面板固定在右上偏移 24/60px 的位置（脚本顶部注释写的「拖动记忆位置」与实现不符）。
- **第三方镜像会看到你在查什么**：biliplus / jiji.moe / beibei 三个域名会收到你查询过的 BV 号（只传 BV 号，不带账号信息）。
- 封面 URL 直接拼进 `<img src="...">` 未做属性转义，来源 HTML 若被投毒存在注入风险。

## 隐私

脚本不含任何 cookie、token、UID 或本地路径；`up_mid` 从当前 URL 读取。对 `api.bilibili.com` 的请求会携带当前登录态（属接口本身要求），对第三方镜像只发送 BV 号。

## 许可

[MIT](./LICENSE)
