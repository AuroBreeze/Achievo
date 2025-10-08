# Achievo V1.2.4 功能与变更汇总（2025-10-08）

> 本文根据今日（本地时间）的最新工作（含未推送提交）整理，概述新增功能、交互优化与缺陷修复，便于发布与回顾。

## 今日概览
- **[日期]** 2025-10-08
- **[版本]** 1.1.3
- **[范围]** 只读/读写接口清晰化、自动保存与事务化写入、DB 并发写入治理、摘要后自动刷新、历史月份过滤（含仓库首次活跃月裁剪）、仓库页 UI 与轮询单位优化、若干类型安全修复

## 主要特性（Features）
- **[只读实时统计接口]**
  - 新增 IPC `stats:getTodayLiveReadOnly`，仅用于显示“今日新增/删除”，不写入数据库。
  - 仪表盘 `Dashboard.tsx` 改为使用只读接口，彻底避免“展示触发写入”的副作用。
- **[自动保存（原子合并）]***
  - 新增 IPC `repo:autoSaveToday`：
    - 暂停追踪器 → 读取 Git 实时总量 → 以“最大值”合并 `insertions/deletions/aiScore/localScore/progressPercent`，并确保 `baseScore` 不回退 → 更新聚合 → 恢复追踪器。
    - 摘要生成完成后自动执行一次“自动保存”，保证最终数据稳定落库。
- **[事务式写入入口]***
  - DB 新增 `applyTodayUpdate()`：在单次调用中合并 counts/metrics/summary/aiMeta，统一更新聚合，并只持久化一次，显著缩短竞态窗口。

## 交互与体验（UX）
- **[摘要后自动刷新]***
  - 主进程在“后台任务完成”与“手动生成完成”后发送 `stats:refresh` 事件，前端监听后立即调用 `refreshAll()`，杜绝“生成完成但页面仍是旧数据”。
- **[仪表盘刷新优先级与忙碌限流]***
  - `refreshAll()` 先加载 `stats:getToday()` 再并行其余接口，确保关键字段（摘要/基础分/趋势/进步百分比）优先稳定渲染。
  - 生成中（todayBusy）时自动降低轮询频率（翻倍且不小于 20s），减少抖动与无效刷新。
- **[仓库页美化与轮询单位（秒）]***
  - `Repo.tsx` 将轮询单位改为“秒”，统一按钮网格布局，路径输入与操作按钮排列更和谐。

## 稳定性与一致性（Stability）
- **[DB 并发写入治理]***
  - 主进程引入 `getSharedDb()`：复用单实例 DB，减少不同实例写同一文件。
  - 追踪器 `TrackerService` 支持注入 `dbProvider`，已改为复用主进程共享实例，消除“多实例并发写”残留风险。
  - DB `persist()` 内部队列化（Promise Queue），确保导出+写文件串行执行。
- **[读写路径统一语义]***
  - 删除读写型 `stats:getTodayLive`（保留只读版）。
  - 摘要路径与追踪器统一为“总量 + 最大值合并”语义，避免“把总量当增量”的重复累计。

## 历史视图（History）
- **[只显示“有用”的月份]***
  - DB 新增：
    - `getMonthsFromDays()`：直接从 `days` 表取去重月份。
    - 强化 `getMonthsWithData()`：只返回在 `days` 中确有数据的月份。
    - `getFirstDayDate()`：返回 DB 首日，供前端兜底裁剪。
  - 新增 IPC：`stats:getMonthsFromDays`、`stats:getMonthsWithData`、`stats:getFirstDayDate`。
  - 前端“历史-月”优先使用 `getMonthsFromDays`，其次 `getMonthsWithData`，仍为空则回退“最近 12 个月”并按 DB 首日裁剪。
- **[按仓库首次活跃月裁剪]***
  - `GitAnalyzer` 新增 `getFirstActiveMonth()`；新增 IPC `stats:getRepoFirstActiveMonth`；前端最终按首个提交月份再次过滤，杜绝显示仓库初始化前的月份。

## 缺陷修复（Fixes）
- **[数据抖动与“消失”问题]***
  - 修复摘要与实时写路径竞态：摘要开始即写入 `lastGenAt`，`setDayCounts()` 在存在 `lastGenAt` 时不改动 `progressPercent`；删除仪表盘的二次 `setDayMetrics`；摘要完成触发一次自动保存与前端刷新。
- **[类型安全与边界值]***
  - 修复 `periodSummaryService.ts` 的多处 TS 报错：安全访问 `days[0]`、校验 `monthKey` 拆分结果、向 `summarizeWithAI` 传入最小 `DiffStat`。
  - 修复 `main.ts` 寝出路径的类型收窄（`dialog.save` 返回值判空后再 `copyFileSync`）。

## 兼容性与迁移
- **[接口变更]***
  - 废弃：`stats:getTodayLive`（读写）。请改用：`stats:getTodayLiveReadOnly`（只读）。
  - 新增：`repo:autoSaveToday`、`stats:getMonthsFromDays`、`stats:getMonthsWithData`、`stats:getFirstDayDate`、`stats:getRepoFirstActiveMonth`。
- **[前端适配]***
  - 仪表盘与仓库页均已完成适配；若自定义扩展，请遵循只读/读写分离与“原子保存”入口。

## 注意事项（Notes）
- **[SQL 安全]***
  - 建议将 `getDaysRange(start,end)` 改为参数化或最少做单引号转义（目前已记录为后续项）。
- **[导出实例统一]***
  - 建议 `db:export` 也使用共享 DB 实例 `sharedDb.getFilePath()`（已在 TODO）。

---

> 如需更多细节，请参考：
> - 后端：`electron/main.ts`、`electron/services/db_sqljs.ts`、`electron/services/summaryService.ts`、`electron/services/tracker.ts`、`electron/services/gitAnalyzer.ts`
> - 前端：`src/components/Dashboard.tsx`、`src/components/Repo.tsx`、`electron/preload.ts`

## 今日提交（自 00:00 起）
> 近期存在未推送的本地变更，此处仅列概要，具体以实际日志为准。
- feat(repo): 新增数据库导入/导出入口与 Toast 反馈，IPC 支持备份与事件广播
- chore(settings): 文案改为“仪表盘刷新间隔”，移除导入/导出按钮
- fix(db): 修复趋势与基础分不一致；移除基础分 0..100 截断
- feat(dashboard): 切仓即时清空并重载；今日总结从 DB 直接读取
