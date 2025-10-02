# Achievo Electron 重构计划（解耦与内聚）

## Findings（现状与问题）

- **[中心编排器耦合较高]**
  - `electron/services/summaryService.ts` 同时依赖：
    - 配置：`getConfig()`（`config.ts`）
    - Git：`GitAnalyzer`（`gitAnalyzer.ts`）
    - 特征/打分：`extractDiffFeatures()`（`diffFeatures.ts`）、`scoreFromFeatures()`（`progressScorer.ts`）、`normalizeLocalByECDF()`（`progressCalculator.ts`）
    - AI：`summarizeUnifiedDiff*()`（`aiSummarizer.ts`）
    - 存储：`db`（`dbInstance.ts` -> `db_sqljs.ts`）、`Storage`（`storage.ts`）
    - 日期：`todayKey()`（`dateUtil.ts`）
  - 作为“用例层”，它汇集多个模块并承担过多细节，属于高扇入依赖点。

- **[数据库单例耦合]**
  - `dbInstance.ts` 暴露单例 `db`，被 `summaryService.ts` 及其他服务使用。
  - `electron/services/db_sqljs.ts` 同时承担：
    - Schema/migrate
    - 业务相关计算（如 `setDayMetrics()` 中的 daily cap/增量计算）
  - 数据层与业务规则混杂，增加复用与测试难度。

- **[计算逻辑分散]**
  - 进步分相关逻辑分布在：
    - `progressScorer.ts`（raw 特征 -> raw 分）
    - `progressCalculator.ts`（归一化/平滑）
    - `db_sqljs.ts`（`setDayMetrics()` 也做了 base/趋势的业务计算）
  - 使得“评分 → 持久化”的职责边界不清晰。

- **[日志与环境开关分散]**
  - 使用 `process.env.ACHIEVO_DEBUG` 字符串门控（`db_sqljs.ts`、计划加到 `summaryService.ts`），缺少统一 Logger，易导致不同环境下的不可控输出。

- **[前后端配置耦合点]**
  - 渲染层 `src/components/Settings.tsx` 直接构造 `localScoring` 并通过 `window.api.setConfig()` 下发。
  - 后端读取 `getConfig()`，与前端字段名强耦合；缺少 schema 校验层（如 zod/类型守卫）。

## Dependency overview（依赖概览）

- **[扇出高]**
  - `summaryService.ts`：依赖最多（AI/Git/评分/DB/配置/存储/日期）。
  - `db_sqljs.ts`：被多处使用，包含 schema/迁移与业务更新。

- **[低耦合工具]**
  - `dateUtil.ts`、`stats.ts`、`codeAnalyzer.ts` 等工具型模块。

## Recommended Actions（建议方案）

- **[分层与端口适配]**
  - 抽出“用例服务接口”与“适配器”：
    - 定义 `DBPort`（`getDay/upsertDay/setDayMetrics/...`），由 `db_sqljs.ts` 实现；`summaryService.ts` 通过依赖注入使用（替代单例）。
    - 定义 `SummarizerPort`（chunked/single）、`GitPort`（diff/numstat）。
  - 目标：`summaryService.ts` 只编排接口，不关心实现细节，降低耦合。

- **[评分责任统一]**
  - 将“本地进步分”完整管线收口到单一模块 `progressEngine.ts`：
    - 输入：`feats`、历史 `localScoreRaw[]`、配置。
    - 输出：`{ localScoreRaw, localScore, debug? }`。
  - `db_sqljs.ts` 仅负责存储；将基准分/趋势计算迁出为 `baseScoreEngine.ts`（或至少下沉到独立引擎）。

- **[去单例，注入依赖]**
  - 替换 `dbInstance.ts`：在 `main.ts` 创建 DB 实例，并传入 `jobManager.ts`/`summaryService.ts`。
  - 测试中可使用“内存 DB 实现”替代，以提升可测性。

- **[统一日志]**
  - 建立 `logger.ts`（基于 pino/debug/winston），分级：`info/debug/error`，命名空间：`db/score/ai/git`。
  - 由 Logger 统一解析环境变量，避免各处 `if (process.env...)`。

- **[配置 Schema 校验]**
  - 使用 zod 校验 `getConfig()` 结果（含 `localScoring`），填充默认并矫正边界值。
  - `Settings.tsx` 仅做 UI；边界与默认在后端 Schema 落实。

- **[IPC/事件边界]**
  - 抽象 `config:updated` 协议为单处常量/类型，前后端共享，避免字段名漂移。

## 执行计划（Phase）

- **Phase 1（最小可行）**
  - 建立接口层：`DBPort/GitPort/SummarizerPort` 并在 `summaryService.ts` 注入使用。
  - `progressEngine.ts` 收口评分链；`summaryService.ts` 只负责编排。
  - `logger.ts` 引入并替换分散的环境门控。
  - `config` 引入 zod 校验，生成安全配置对象。

- **Phase 2（结构优化）**
  - 去除 `dbInstance.ts` 单例；在 `main.ts` 统一创建与注入。
  - 下沉基准分规则为 `baseScoreEngine.ts`，`db_sqljs.ts` 只做 CRUD + migrate。
  - 集中 `ipcEvents.ts`（常量/类型）并共享至渲染层。
  - 在 `progressEngine` 提供可选 `debug` 字段，仅在调试环境输出。

## Summary（小结）

- 当前结构清晰，但“编排器（`summaryService.ts`）”与“数据层（`db_sqljs.ts`）”负担过重导致耦合偏高。
- 通过“接口化/引擎化/依赖注入/统一日志/配置校验”的渐进式重构，可显著降低耦合、提升可测性与可维护性。
- 如需，可先提交最小 PR：创建 `progressEngine.ts` 与 `DBPort` 接口，并让 `summaryService.ts` 切换到依赖注入。
