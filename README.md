# Achievo

Electron + React + Tailwind + TypeScript 的「代码进步追踪器」MVP。

## 开发

1. 安装依赖
```bash
pnpm i # 或 npm i / yarn
```
2. 配置环境变量（可选）
- 创建 `.env` 并设置 `OPENAI_API_KEY`，或在应用设置里填入

3. 启动开发环境
```bash
pnpm dev
```
渲染进程由 Vite 启动，Electron 在端口就绪后启动。

## 构建
```bash
pnpm build
```

## 模块
- 代码分析：`electron/services/codeAnalyzer.ts`
- 进度评分：`electron/services/progressScorer.ts`
- AI 总结：`electron/services/aiSummarizer.ts`
- 存储：`electron/services/storage.ts`
- 配置：`electron/services/config.ts`

## 安全
- 通过 `preload.ts` 暴露受限 API，禁用 `nodeIntegration`，启用 `contextIsolation`。
