# Achievo Electron 子项目计划（architecture & refactor）

## 目标
- [ ] 将 `electron/main.ts` 中的业务逻辑服务化，保持 `main.ts` 专注于窗口生命周期与 IPC 转发。
- [ ] 任务生成（“今日总结”）在后台稳健运行，切页不中断，进度可感知，可恢复。
- [ ] 指标口径统一且可解释：今日/累计改动数（insertions/deletions/total）。
- [ ] 打包产物在 Windows/macOS/Linux 上稳定可用（WASM/路径/图标/镜像）。

## 当前问题
- [ ] `main.ts` 行数多、职责过多（窗口、任务编排、DB 持久化、Git 调用、AI 调用、统计口径）。
- [ ] 背景任务与 UI 耦合（进度/状态散落），复用难，测试难。

## 拆分与模块边界
- [ ] SummaryService（`services/summaryService.ts`）
  - [ ] 读取当日 key、获取 unified diff/numstat（依赖 `GitAnalyzer`）。
  - [ ] 提取特征（依赖 `diffFeatures.ts`）。
  - [ ] 调用 AI 摘要：优先分片 `summarizeUnifiedDiffChunked`（携带 `onProgress`）。
  - [ ] DB 持久化：`setDayCounts`/`setDaySummary`/`setDayMetrics`/`setDayAiMeta`/`updateAggregatesForDate`。
  - [ ] API：`generateTodaySummary(opts?: { onProgress?: (done: number, total: number) => void }): Promise<Result>`
  - [ ] API：`buildTodayUnifiedDiff(): Promise<{ date: string; diff: string }>`

- [x] JobManager（`services/jobManager.ts`）
  - [ ] 后台任务状态机：`idle|running|done|error`、`progress 0..100`、`startedAt/finishedAt`、`error`、`result`。
  - [ ] `startTodaySummaryJob(run: () => Promise<Result>, emit: (p:number)=>void)`（幂等）
  - [ ] `getTodayJobStatus()`

- [x] WindowService（`services/window.ts`）
  - [ ] 统一创建 `BrowserWindow` 与系统集成（隐藏菜单栏、转发 `window:maximize-changed` 等）。

- [x] StatsService 扩展（`services/stats.ts`）
  - [ ] 保留：`getToday()/getRange()/generateOnDemandSummary()`。
  - [ ] 补齐：`getTodayLive()`、`getTotalsLive()` 的核心逻辑迁入 service，`main.ts` 仅做 IPC 转发。

- [ ] Utilities
  - [x] `dateUtil.ts`：`todayKey()`、`yesterdayKey(key)`、`toKey(date)`。

-## IPC 设计（main.ts 保留）
- [x] `summary:job:start` / `summary:job:status` / `summary:job:progress`（转调 JobManager + SummaryService）
- [x] `summary:todayDiff` → `SummaryService.generateTodaySummary()`（直调版，保留）
- [x] `diff:today` → `SummaryService.buildTodayUnifiedDiff()`
- [ ] `stats:getToday` / `stats:getRange` / `stats:getTotals` / `stats:getTodayLive` / `stats:getTotalsLive` → 转发到 `StatsService`
- [ ] 配置、窗口控制、tracking：保持不变

## 进度映射（后台任务）
- [x] 10%：准备完成（配置/仓库/日期）
- [x] 20%：提取特征、本地分计算
- [x] 20%..95%：分片摘要进度（`onProgress(done,total)`）
- [x] 96%..100%：AI 返回与持久化完成

## 迁移步骤（小步快跑，可回滚）
- [x] 抽出 `dateUtil.ts` 与 `progressCalculator.ts`，替换 `main.ts` 内部调用。
- [x] 新建 `summaryService.ts`，将 `summary:todayDiff` 与 `runTodaySummaryJob()` 流程迁入，`main.ts` 改为调用 service。
- [x] 新建 `jobManager.ts`，`summary:job:start`/`status` 与事件发射逻辑迁入。
- [x] 扩展 `stats.ts`，把 `getTodayLive`/`getTotalsLive` 核心逻辑迁入，`main.ts` 只转发。
- [x] 新建 `window.ts`，抽离窗口创建与事件绑定。
- [x] 清理 `main.ts` imports 与冗余逻辑，保留 IPC 注册与生命周期管理。

# 注：已不再规划/追踪“分数/进步百分比”等口径，后续计划仅关注改动计数与架构质量。

## 测试与验收
- [ ] 单测：`dateUtil` 键值与跨天边界。
- [ ] 集成：`summaryService.generateTodaySummary()` 在模拟仓库（小/大 diff）下运行，验证分片进度回调与最终持久化。
- [ ] 集成：`stats.getTodayLive()/getTotalsLive()` 与 DB/工作区变更一致性。
- [ ] 端到端：启动 dev/打包后点击“生成今日总结”，切页返回看到进度，完成后看到结果与元信息。

## 打包与部署
- [ ] `asarUnpack: ["node_modules/sql.js/dist/**"]` 保持；`locateFile()` dev/prod 兼容。
- [ ] `vite.config.ts` 保持 `base: './'`，避免 file:// 白屏。
- [ ] 镜像变量：`ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`。
- [ ] 产物：Windows NSIS、macOS DMG、Linux AppImage。

## 验收标准
- [ ] `main.ts` 行数显著减少，职责单一；服务层可独立测试。
- [ ] 生成任务切页不中断，进度准确（分片级推进）。
- [ ] 指标口径明确：
  - [ ] “总改动数”= 累计；
  - [ ] “今日新增/删除/合计”= 当日实时。
