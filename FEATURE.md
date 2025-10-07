# Achievo V1.1.3 功能与变更汇总（2025-10-07）

> 本文根据今日（本地时间）的最新工作（含未推送提交）整理，概述新增功能、交互优化与缺陷修复，便于发布与回顾。

## 今日概览
- **[日期]** 2025-10-07
- **[版本]** 1.1.3
- **[范围]** 仓库页数据库导入/导出、仓库切换即时刷新、基础分/趋势一致性修复、Windows Git 长路径修复、设置文案与入口调整

## 主要特性（Features）
- **[仓库页：数据库导入/导出]**
  - 在 `Repo.tsx` 将“导出数据库”“导入数据库”与“复制路径/打开数据库目录”并列，统一通过 Toast 反馈结果。
  - `electron/main.ts` 新增 IPC：`db:export`、`db:import`（导入前自动备份 `.bak.<timestamp>.sqljs`，导入后广播 `db:imported`）。
  - `electron/preload.ts` 暴露 `dbExport()`、`dbImport()`、`onDbImportedOnce()` 给前端。
- **[仓库切换：即时清空并重载]**
  - `Dashboard.tsx` 监听 `config:updated(repoPath)`：
    - 立刻清空“今日/汇总/趋势/AI 元数据”等状态，避免跨仓数据混淆。
    - 取消防抖，立即依次拉取 `loadTodayLive()/loadToday()/loadTotals()/loadDailyRange()`。
    - `loadToday()` 直接从 DB 读取 `summary` 填充，杜绝旧仓库文案残留。
- **[设置：文案与入口优化]**
  - `SettingsDatabase.tsx` 将“数据库轮询间隔（秒）”重命名为“仪表盘刷新间隔（秒）”，新增说明文字。
  - 移除设置页的“导入/导出数据库”按钮，统一在“仓库”页操作，入口更聚合。

## 缺陷修复（Fixes）
- **[Windows Git：长路径]**
  - `gitAnalyzer.ts` 在每个仓库首次操作前自动执行 `git config core.longpaths true`（仅 Windows），修复“Filename too long”。
- **[基线提交解析：避免多行父提交导致的路径误解]**
  - `gitAnalyzer.ts:getDiffNumstat()` 改用 `rev-parse <toCommit>^` 获取第一父单一哈希，避免将多行输出拼接为路径引发错误。
- **[基础分与趋势一致性]**
  - `db_sqljs.ts:setDayCounts()`（当日已有总结 `lastGenAt`）：
    - 使用回退 `prevBase = max(100, yesterday?.baseScore || 100)`，并以 `trend = keepBase - prevBase` 计算，避免“昨日缺失→趋势=0”。
  - `db_sqljs.ts:setDayBaseScore()`：与上同一回退策略；去除对 `baseScore` 的 0..100 截断，保留实际值（四舍五入）。
  - `main.ts:stats:getToday`：若检测到 `trend !== (baseScore - prevBase)`，自动调用 `setDayBaseScore()` 纠正并返回修正后的行，确保重启/切仓后一致。

## 行为变更（Breaking/Behavior Changes）
- **[基础分不再截断到 0..100]**
  - 现在按真实基础分入库（四舍五入）。在极端情况下，趋势展示会更贴近实际计算结果。
- **[切仓刷新策略调整]**
  - 由“延迟/防抖”改为“立即刷新”。切换仓库后会瞬时清空并重新加载，UI 反馈更确定。
- **[导入/导出入口位置调整]**
  - 统一到“仓库”页，设置页不再提供该入口。

## 受影响文件
- `electron/main.ts`
- `electron/preload.ts`
- `electron/services/gitAnalyzer.ts`
- `electron/services/db_sqljs.ts`
- `src/components/Repo.tsx`
- `src/components/Dashboard.tsx`
- `src/components/settings/SettingsDatabase.tsx`

## 今日提交（自 00:00 起）
> 近期存在未推送的本地变更，此处仅列概要，具体以实际日志为准。
- feat(repo): 新增数据库导入/导出入口与 Toast 反馈，IPC 支持备份与事件广播
- chore(settings): 文案改为“仪表盘刷新间隔”，移除导入/导出按钮
- fix(git): Windows 启用 core.longpaths；父提交解析改用 rev-parse，避免多行输出
- fix(db): 修复趋势与基础分不一致；移除基础分 0..100 截断
- feat(dashboard): 切仓即时清空并重载；今日总结从 DB 直接读取
