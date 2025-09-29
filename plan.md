# Achievo 开发计划 (MVP)

## 目标
- 提供基于 Electron 的本地应用，评估代码改动的「进步分数」，并由 AI 生成中文总结。
- 使用 TS 严格类型与模块化设计，确保易扩展。

## 技术栈
- Electron + TypeScript + React + Vite
- Tailwind CSS UI
- OpenAI API (chat.completions, gpt-4o-mini)
- 本地 JSON 存储（userData 目录）

## 核心模块与分工
- 代码分析 (`electron/services/codeAnalyzer.ts`)
  - MVP：行级对比，统计 added/removed/changed
  - 未来：AST/语义分析、复杂度指标
- Git 分析 (`simple-git`)（可选）
  - MVP：留空或最简查询；后续加入提交统计、Diff 范围选择
- 进度计算 (`electron/services/progressScorer.ts`)
  - MVP：按权重归一化并 0..100 取整
  - 未来：结合圈复杂度、覆盖率、Lint、类型错误
- AI 总结 (`electron/services/aiSummarizer.ts`)
  - MVP：基于 DiffStat + Score 的中文总结
  - 未来：上下文扩展（文件名、提交信息）、可控风格
- 数据存储 (`electron/services/storage.ts`)
  - MVP：JSON 追加
  - 未来：SQLite/IndexedDB、数据迁移
- 配置管理 (`electron/services/config.ts`)
  - MVP：userData JSON；支持 openaiApiKey / repoPath
  - 未来：多环境、Schema 校验、加密敏感字段
- UI 组件（`src/components/*`）
  - Dashboard：输入 before/after，显示分数与总结
  - HistoryChart：折线图展示历史分数
  - Settings：配置 OpenAI Key / Repo 路径

## 路线图
- 第 1 步：项目脚手架、配置与基础 UI（已开始）
- 第 2 步：打通 IPC，完成 MVP 分析与总结流（进行中）
- 第 3 步：Git 可选统计、错误处理与日志完善
- 第 4 步：打包与分发（electron-builder）

## 风险与对策
- OpenAI 可用性：提供错误回退（展示失败原因，不阻塞分数）
- 分析准确性：采用简化算法，后续引入更强信号
- 存储一致性：写前读+整体覆盖，避免部分写入

## 成功标准
- 可运行的 Electron 应用
- 输入两段代码可得到分数与总结
- 历史记录可视化
