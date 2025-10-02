# Achievo V1.1.2 功能与变更汇总（2025-10-02）

> 本文根据今日（本地时间）的最新工作（含未推送提交）整理，概述新增功能、重构解耦与缺陷修复，便于发布与回顾。

## 今日概览
- **[日期]** 2025-10-02
- **[版本]** 1.1.2（package.json）
- **[范围]** 服务层解耦（端口/适配器）、评分引擎抽离、基础分引擎抽离、AI 摘要端口化、严格类型修复

## 主要特性（Features）
- **[端口/适配器：服务解耦]**
  - 新增 `Ports` 抽象：`DBPort`、`GitPort`、`SummarizerPort`，以及 `makeDefaultPorts()` 默认装配。
  - `summaryService.ts` 通过端口注入 `db/git/cfg/summarizer`，去除对单例与具体实现的直接依赖。
  - 相关文件：`electron/services/ports.ts`、`electron/services/summaryService.ts`。
- **[本地进步分引擎]**
  - 新增 `progressEngine.ts`，统一完成 `raw → ECDF/冷启动 → 平滑 → 回归封顶` 的流水线，支持 `ACHIEVO_DEBUG=score` 调试输出。
  - `summaryService.ts` 改为调用 `computeLocalProgress()`，减少编排器逻辑负担。
  - 相关文件：`electron/services/progressEngine.ts`、`electron/services/summaryService.ts`。
- **[基础分引擎]**
  - 新增 `baseScoreEngine.ts`，将日增/封顶/趋势计算封装为纯函数，数据层仅负责 CRUD 与调用。
  - `db_sqljs.ts:setDayMetrics()` 接入 `computeBaseUpdate()`，保留原有调试字段结构。
  - 相关文件：`electron/services/baseScoreEngine.ts`、`electron/services/db_sqljs.ts`。
- **[AI 摘要端口化]**
  - `summaryService.ts` 改为通过 `SummarizerPort` 调用 `summarizeUnifiedDiff*()`，移除对 `aiSummarizer.ts` 的直接 import。
  - 相关文件：`electron/services/ports.ts`、`electron/services/summaryService.ts`、`electron/services/aiSummarizer.ts`（接口兼容）。

## 缺陷修复（Fixes）
- **[严格类型与空安全]**
  - 修复 ECDF/分位数实现的严格空检查（`progressCalculator.ts`），通过非空断言与边界保护消除 TS 报错。
  - 修正 `ports.ts` 接口签名与适配器实现不一致问题（`DBPort.upsertDayAccumulate`、`GitPort.getNumstatSinceDate`）。
- **[总结服务稳定性]**
  - 统一 try/catch、作用域变量与持久化顺序，避免 `lastGenAt/estTokens` 与 `db`/`pdb` 引用不当导致的异常。

## 行为变更（Breaking/Behavior Changes）
- **[编排器职责收敛]**
  - `summaryService.ts` 仅负责编排端口与引擎结果；评分与基础分的计算细节下沉至引擎层。
- **[数据层去业务化]**
  - `db_sqljs.ts` 不再内联基础分业务规则，改为调用 `baseScoreEngine.ts`，便于参数调优与单元测试。

## 受影响文件
- `electron/services/ports.ts`
- `electron/services/summaryService.ts`
- `electron/services/progressEngine.ts`
- `electron/services/baseScoreEngine.ts`
- `electron/services/progressCalculator.ts`
- `electron/services/db_sqljs.ts`
- `electron/services/gitAnalyzer.ts`
- `electron/services/aiSummarizer.ts`

## 今日提交（自 00:00 起）
> 近期存在未推送的本地变更，此处仅列概要，具体以实际日志为准。
- refactor(services): 引入 Ports/Adapters，summary 通过端口注入依赖
- feat(engine): 新增 progressEngine，统一本地进步分流水线
- feat(engine): 新增 baseScoreEngine，db_sqljs 接入基础分引擎
- fix(types): 修复 ECDF 严格空检查与端口签名不一致
- refactor(summary): AI 摘要改为通过 SummarizerPort 调用

