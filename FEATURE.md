# Achievo V1.1.1 功能与变更汇总（2025-10-02）

> 本文根据今日（本地时间）提交记录自动生成，概述新增功能、行为变更与缺陷修复，便于发布与回顾。

## 今日概览
- **[日期]** 2025-10-02
- **[版本]** 1.1.1（package.json）
- **[范围]** 核心评分/进度模型、进度百分比、数据库轮询与前端布局/设置

## 主要特性（Features）
- **[进度百分比：复杂混合模型]**
  - 引入综合模型，融合以下信号：`trend/prevBase`、`localScore`（语义分）、`aiScore`、`totalChanges`（当日 LoC，总改动数采用递减收益）。
  - 超过 21% 后使用指数缓升（近似正态尾部）：越往上越难接近上限（25%），避免过快“拉满”。
  - 相关文件：`electron/services/progressCalculator.ts`、`electron/services/summaryService.ts`。
- **[本地进步分 Gaussian 映射]**
  - 为 `localScore` 增加 Logistic S 曲线映射（midpoint≈60，slope≈12），使中段更易增长、尾部更难（符合正态感知）。
  - 仅在“生成今日总结”时更新落库，日常轮询不变更本地/AI 分。
  - 相关文件：`electron/services/progressCalculator.ts`、`electron/services/summaryService.ts`。
- **[数据库轮询间隔设置]**
  - 在设置页新增“数据库轮询间隔（秒）”，仪表盘按该间隔刷新今日/总计/区间数据。
  - 相关文件：`electron/services/config.ts`、`src/components/Settings.tsx`、`src/components/Dashboard.tsx`。

## 缺陷修复（Fixes）
- **[基础分跳动 +1 的尾差问题]**
  - 修复浮点尾差导致的“额度接近 0 仍出现 +1”的问题；当 `remainingAllowance < 1` 视为 0，`incApplied = 0`。
  - 生成总结后冻结当日 `baseScore`/`trend`（非 overwrite 情况下不再变更），避免总结后再被轮询顶高。
  - 相关文件：`electron/services/db_sqljs.ts`。
- **[时区导致“昨天”计算错误]**
  - `getYesterday()` 改为本地日期格式化，避免 UTC 偏移导致“昨天被算成前天”。
  - 相关文件：`electron/services/db_sqljs.ts`。
- **[前端类型问题]**
  - 订阅/恢复总结状态时，给 `window.api` 调用加可选链，消除 TS18048。
  - 相关文件：`src/components/Dashboard.tsx`。
- **[布局与体验]**
  - 调整主内容区域左内边距，隐藏侧边栏时更多留白（`pl-20`）；展开时内容保持在侧边栏下方，减少重排、渲染更稳定。
  - 相关文件：`src/App.tsx`。

## 行为变更（Breaking/Behavior Changes）
- **[进度百分比来源]**
  - 现在随 DB 轮询实时重算并持久化；本地/AI 分只在“生成今日总结”时写入，不再随轮询变化。
- **[基础分增长上限比例]**
  - 单日增幅上限由 50% 下调至 **20%**，并集中用常量 `DAILY_CAP_RATIO` 管理（便于后续调参）。

## 受影响文件
- `electron/services/config.ts`
- `electron/services/db_sqljs.ts`
- `electron/services/progressCalculator.ts`
- `electron/services/summaryService.ts`
- `src/App.tsx`
- `src/components/Dashboard.tsx`
- `src/components/Settings.tsx`

## 今日提交（自 00:00 起）
> 仅列出概要（hash/时间/主题），以实际 log 为准。
- d6d27ac 2025-10-02 10:01 修复 db_sqljs：每日增量浮点精度与更新逻辑优化
- cf93364 2025-10-02 09:55 修复 App 布局：主内容区域左边距调整（pl-14 → pl-20）
- 7855487 2025-10-02 09:44 新增 progress：复杂进度百分比模型 + 高斯归一化
- 6d0a5e0 2025-10-02 09:34 新增 progress：混合进度计算模型
- 26d6e1d 2025-10-02 09:22 新增 config：数据库轮询间隔配置
- 458e690 2025-10-02 09:18 新增 db：引入每日增量上限比例并优化基础分计算

