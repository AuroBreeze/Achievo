# Achievo 功能与特性（v1.0.0）

## 核心能力
- **[Dashboard 总览]** 最近 30 天的四类曲线：基础分、本地进步分、AI 进步分、进步百分比（`src/components/Dashboard.tsx`）。
- **[实时统计]** 统计当日插入/删除（含工作区未提交），并刷新基础分与趋势（`stats:getTodayLive`）。
- **[统一 Diff 查看]** 内置“今日改动详情”，支持复制与语法高亮（`diff:today`）。
- **[AI 总结]** 按分片生成与合并，展示元信息（模型/Provider/tokens/耗时/分片）（`electron/services/aiSummarizer.ts`）。
- **[本地评分]** 基于改动特征的启发式进步分（`scoreFromFeatures()` 与 `diffFeatures.ts`）。

## 评分与进步指标
- **[基础分 BaseScore]**
  - 累积型，包含指数衰减的行数贡献与语义贡献（AI/本地）。
  - 每日基础分增量封顶为“昨日基础分”的 50%（见 `electron/services/db_sqljs.ts`）。
  - 极小正增量至少记为 1 分，避免被四舍五入为 0。
- **[进步百分比 Progress%]**
  - 与昨日基准（BaseScore）对比的相对提升，四舍五入；最大 25%（见 `electron/main.ts`）。
  - 允许为负（若当日弱于昨日）。

## Git 与改动分析
- **[Git 统计]**
  - 自 `git rev-list --before=<today>` 以来的提交 + 工作区变更，统计当日插入/删除（`GitAnalyzer.getNumstatSinceDate()`）。
  - 提供统一 Diff 文本（含重命名/复制检测、textconv）：`getUnifiedDiffSinceDate()`。
- **[改动特征]**
  - 识别代码/测试/文档/配置/安全敏感等类别和语言分布（`extractDiffFeatures()`）。
  - 简单 JS/TS AST 片段解析，统计函数/类/导出新增量（`analyzeJsTsSnippet()`）。

## AI 集成
- **[分片摘要]** 大 Diff 自动切片（默认 ~48k 字符片段），逐片总结，最后合并（`summarizeUnifiedDiffChunked()`）。
- **[Provider 抽象]** 支持自定义模型与 Base URL；记录 tokens、耗时、分片数、时间戳（`setDayAiMeta()`）。
- **[降级策略]** AI 失败时回退为纯文本说明，不阻塞分数与使用。

## 持久化与数据模型
- **[日聚合]** `days` 表：date、insertions、deletions、baseScore、trend、summary、ai/local 分数、进步百分比、AI 元信息。
- **[周/月/年]** 自动聚合，随当日数据更新刷新（`updateAggregatesForDate()`）。
- **[导出]** 规划支持 CSV/JSON 导出与备份（见 `plan.md`）。

## 打包与运行
- **[生产路径稳定]** `vite.config.ts` 使用 `base: './'`，确保 file:// 模式加载静态资源无白屏。
- **[WASM 适配]** `sql.js` 的 `sql-wasm.wasm` 通过 `asarUnpack` 解包并用 `locateFile()` 多路径兜底（`db_sqljs.ts`）。
- **[镜像加速]** 可设置 `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR` 加速下载。
- **[签名/图标]** 支持禁用自动签名；使用合规多尺寸 ICO/ICNS，避免 rcedit 失败。

## 配置项（通过 Preload 暴露）
- `repoPath`: Git 仓库路径。
- `aiProvider`, `aiModel`, `aiBaseUrl`, `aiApiKey`: AI 供应商及凭证。
- `lastProcessedCommit`, `lastSummaryDate`: 用于后续增量策略（预留）。

## UI 与交互
- **[设置页]** 配置仓库路径与 AI。
- **[快捷入口]** Dashboard 顶部显示“生成今日总结 / 查看今日改动详情”。
- **[元信息]** 在 AI 输出上方显示长度、分片、模型/Provider、tokens、耗时、上次生成时间。

## 路线图（摘要）
- **近期**：日期/提交范围选择、多仓支持、错误页与结构化日志、导出与备份。
- **中期**：特征权重深化、样本调参、报表（周报/月报模板）。
- **长期**：团队共享、Server 模式与集中化分析、插件生态。

## 故障排查要点
- **白屏**：确认 `vite.config.ts` 的 `base: './'`，并重装后重试。
- **WASM ENOENT**：检查安装目录的 `resources/app.asar.unpacked/node_modules/sql.js/dist/sql-wasm.wasm` 是否存在。
- **打包签名失败**：关闭 `CSC_IDENTITY_AUTO_DISCOVERY` 或以管理员/开发者模式运行。
- **图标错误**：使用标准多尺寸 ICO/ICNS 或暂时移除图标配置。
