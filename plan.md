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

---

## MVP 巩固与缺口补齐
- **[错误处理]** 后端 `ipcMain.handle()` 统一 try/catch，标准化错误码与消息（`electron/main.ts`）。
- **[持久化可靠性]** 为 `db_sqljs` 增加写入失败重试与文件锁（`electron/services/db_sqljs.ts`）。
- **[WASM 资源]** 打包时确保 `sql.js` wasm 正确解包（已添加 `asarUnpack`），同时 `locateFile()` 多路径兜底。
- **[首日体验]** 无仓库/无改动时的引导文案与占位内容（`Dashboard`）。
- **[设置校验]** `repoPath` 存在性校验、git 可用性检测并提示修复。

## 核心功能增强（短期）
- **[Git 范围]** 支持选择日期/提交范围生成总结与评分（扩展 `GitAnalyzer`）。
- **[进步分本地算法]** 丰富特征：重命名/新增测试/配置变更权重、语言差异权重（`diffFeatures.ts`）。
- **[模型抽象]** 支持 OpenAI/DeepSeek/自定义 API 的统一接口与超时/重试/速率限制（`aiSummarizer.ts`）。
- **[离线模式]** 无 API Key 时仅使用本地评分与简报模板输出。
- **[多仓支持]** 允许选择/切换多个仓库并分别统计聚合。

## 体验与可用性优化
- **[首次上手]** 引导页：一键选择仓库、检测 git、填写 API Key、演示示例。
- **[UI 性能]** 图表按需渲染/虚拟滚动；大 diff 展示时分段折叠与搜索。
- **[可控风格]** AI 输出风格预设：精简/详细/风险导向/周报。
- **[国际化]** i18n（中文/英文），文案集中管理。
- **[键盘操作]** 快捷键：刷新、复制摘要、展开/折叠 diff、打开设置。

## 分数与进步指标（算法）
- **[基础分]** 已将日增量封顶为昨日基础分的 50%（`db_sqljs.ts`）。
- **[进步百分比]** 与昨日基准比较，最大 25%，必要时可加下限 0%。
- **[权重校准]**
  - 行数（插入/删除）指数衰减上限。
  - 测试/文档/配置与安全敏感改动的加成或扣分。
  - 语言特定权重（例如 TS/Go/Java 对质量指标更敏感）。
  - 通过“标注样本”做简单网格搜索调参。

## 数据与存储
- **[数据模型]** days/weeks/months/years 聚合完善，记录 AI 元信息（模型/耗时/tokens/分片）。
- **[备份/导出]** 支持导出 CSV/JSON；定期快照；从备份恢复。
- **[迁移]** 设计 `PRAGMA user_version` 与 schema 迁移脚本；从 JSON 迁移到 sql.js 的一次性脚本。
- **[清理策略]** 最大保存天数/体积；旧分片清理；日志滚动。

## 打包与分发
- **[图标与品牌]** 生成符合规范的多尺寸 ICO/ICNS，避免 rcedit 失败。
- **[渠道包]** Windows: nsis/portable/zip；macOS: dmg；Linux: AppImage/deb。
- **[镜像与缓存]** 文档化环境变量（`ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`）。
- **[签名/公证]** 可选配置，提供跳过签名的说明与安全提示。

## 观测与诊断
- **[日志]** 主/渲染进程结构化日志（level/模块/traceId），可导出诊断包。
- **[故障页面]** 捕获渲染错误展示“恢复/重试/导出日志”。
- **[性能指标]** 记录一次总结耗时、tokens、分片数、缓存命中等，前端显示元信息（已在 `Dashboard` 展示）。

## 质量与自动化
- **[测试]** 单元测试（特征提取、分数计算、日期聚合）、集成测试（IPC 流程）、端到端冒烟（打包后启动检查）。
- **[CI]** lint+typecheck+test；可选 nightly 打包产物。
- **[代码规范]** ESLint/Prettier/严格 TS（noUncheckedIndexedAccess 已启用）。

## 安全与隐私
- **[敏感信息]** 本地加密存储 API Key；允许自定义代理/私有基座。
- **[最小权限]** 不扫描用户目录外部路径；按用户授权访问仓库。
- **[数据出境]** 明确哪些数据会被发送给模型（可选脱敏/忽略文件列表）。

## 路线图（里程碑）
- **M1：MVP 完成**（分析/评分/总结/历史/打包）
- **M2：可用性提升**（引导、错误处理、日志、i18n）
- **M3：算法增强**（更多特征与权重校准、进步解释性）
- **M4：多仓/范围/报表**（周报/月报导出，团队共享方案）
- **M5：发布与反馈**（渠道包、崩溃与使用反馈收集、改进循环）

