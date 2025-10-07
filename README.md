# Achievo

<div align="center">
  <h3>📊 代码进步追踪器</h3>
  <p>基于 Git 提交历史的智能代码进步分析工具</p>
  <p>
    <img src="https://img.shields.io/badge/Electron-31.4.0-blue" alt="Electron">
    <img src="https://img.shields.io/badge/React-18.3-blue" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-5.6-blue" alt="TypeScript">
    <img src="https://img.shields.io/badge/License-GPLv3-green" alt="License">
  </p>
</div>

---

## ✨ 功能特性

- **📈 实时代码统计** - 自动追踪每日代码新增/删除行数
- **🎯 智能评分系统** - 基于累积基础分 + AI 质量评分的混合评分机制
  - 每日增量上限为昨日基础分的 40%（递减收益）
  - AI 评分分析代码质量和架构改进
  - 本地评分评估相对进步
- **🤖 AI 代码总结** - 支持 OpenAI / DeepSeek / 自定义 API
  - 自动生成每日代码变更摘要
  - 特性提取和进度分析
- **📊 可视化图表** - 30 天趋势图、基础分/AI 分对比
- **⚡ 自动追踪** - 后台定时监控 Git 仓库变更
- **🎨 现代化 UI** - Tailwind CSS + 渐变主题 + 响应式设计

---

## 📣 What's New — V1.1.3

本次版本聚焦“仓库页导入/导出数据库、切仓即时刷新、基础分/趋势一致性与 Windows 长路径修复”。完整说明见 [`FEATURE.md`](./FEATURE.md)。

- **[Features]**
  - 仓库页新增“导出数据库/导入数据库”按钮，和“复制路径/打开数据库目录”并列，操作结果通过 Toast 反馈。
  - 设置页优化：将“数据库轮询间隔（秒）”重命名为“仪表盘刷新间隔（秒）”，并移除导入/导出入口（统一至仓库页）。
  - 切换仓库时立即清空并重载仪表盘数据，“今日总结/基础分/趋势”等均直接从新仓库 DB 读取。
- **[Fixes]**
  - Windows Git 开启 `core.longpaths=true`，并使用 `rev-parse <to>^` 解析第一父提交，修复“Filename too long”与多行父提交导致的路径误解。
  - 修复基础分与趋势的不一致：当日已有总结时按昨日基础分回退计算趋势；取消基础分 0..100 截断以保留真实值。
- **[Behavior Changes]**
  - 导入/导出入口统一到“仓库”页；切仓由延迟刷新改为即时刷新。

---

## 🚀 快速开始

### 安装

#### 方式 1：下载预编译版本（推荐）
前往 [Releases](https://github.com/你的用户名/Achievo/releases) 页面下载对应平台的安装包：
- **Windows**: `Achievo-Setup-0.1.0.exe`
- **macOS**: `Achievo-0.1.0.dmg`
- **Linux**: `Achievo-0.1.0.AppImage`

#### 方式 2：从源码构建
```bash
# 克隆仓库
git clone https://github.com/你的用户名/Achievo.git
cd Achievo

# 安装依赖
npm install

# 启动开发环境
npm run dev

# 打包应用
npm run package
```

### 使用说明

1. **配置 Git 仓库**
   - 点击「设置」按钮
   - 选择要追踪的 Git 仓库路径
   - 配置 AI 服务（可选）：
     - OpenAI API Key
     - DeepSeek API Key
     - 或自定义 API 端点

2. **开始追踪**
   - 点击「开始追踪」按钮
   - 应用将自动分析 Git 提交历史
   - 实时显示代码统计和评分

3. **查看分析**
   - **今日概览**：新增/删除行数、基础分、趋势
   - **AI 总结**：点击「生成今日总结」获取智能分析
   - **图表**：查看 30 天基础分和 AI 分趋势

> 提示：在“仓库”页可直接进行“导出数据库/导入数据库/打开数据库目录/复制仓库路径”等操作。

---

## 📦 技术栈

- **前端框架**: React 18 + TypeScript
- **桌面框架**: Electron 31
- **样式**: Tailwind CSS + @tailwindcss/typography
- **图表**: Chart.js + react-chartjs-2
- **数据库**: SQL.js (SQLite in-memory)
- **Git 操作**: simple-git
- **AI 集成**: OpenAI SDK
- **构建工具**: Vite + esbuild + electron-builder

---

## 🏗️ 项目结构

```
Achievo/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本（安全桥接）
│   └── services/         # 核心服务
│       ├── db_sqljs.ts       # 数据库服务（SQL.js）
│       ├── gitAnalyzer.ts    # Git 分析
│       ├── stats.ts          # 统计服务
│       └── aiSummarizer.ts   # AI 总结
├── src/                  # React 渲染进程
│   ├── components/       # UI 组件
│   │   ├── Dashboard.tsx # 主面板
│   │   └── Settings.tsx  # 设置页
│   ├── types/           # TypeScript 类型定义
│   └── App.tsx          # 应用入口
└── package.json         # 项目配置
```

---

## 🔧 开发

### 环境要求
- Node.js >= 18
- npm / pnpm / yarn

### 开发命令
```bash
# 安装依赖
npm install

# 启动开发环境（热重载）
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 构建生产版本
npm run build

# 打包应用（所有平台）
npm run package

# 打包 Windows 版本
npm run package:win

# 打包 macOS 版本
npm run package:mac

# 打包 Linux 版本
npm run package:linux
```

### 环境变量（可选）
创建 `.env` 文件：
```env
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

---

## 📊 评分机制

### 基础分计算
- **初始值**: 100 分
- **每日增量**: 基于代码行数变化，采用递减收益公式
  - 新增行权重: 1.6
  - 删除行权重: 0.8
  - 公式: `increment = 100 * (1 - exp(-raw / 220))`
- **上限**: 每日增量不超过昨日基础分的 25%

### AI 评分（0-100）
- 代码质量分析
- 架构改进评估
- 最佳实践遵循度

### 本地评分（0-100）
- 相对进步评估
- 与历史数据对比

---

## 🔒 安全性

- ✅ 禁用 `nodeIntegration`
- ✅ 启用 `contextIsolation`
- ✅ 通过 `preload.ts` 暴露受限 API
- ✅ API Key 存储在本地加密配置中

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 [GNU General Public License v3.0 (GPL-3.0)](LICENSE) 开源协议。

---

## 🙏 致谢

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Chart.js](https://www.chartjs.org/)
- [OpenAI](https://openai.com/)

---

<div align="center">
  <p>如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！</p>
</div>
