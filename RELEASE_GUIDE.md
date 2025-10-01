# Achievo 发布指南

## 📋 发布前检查清单

### 1. 代码质量检查
```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 测试运行
npm run dev
```

### 2. 版本号更新
编辑 `package.json`，更新 `version` 字段：
```json
{
  "version": "0.1.0"  // 修改为新版本号，如 0.2.0
}
```

版本号规则（语义化版本）：
- **主版本号**（Major）：不兼容的 API 修改
- **次版本号**（Minor）：向下兼容的功能性新增
- **修订号**（Patch）：向下兼容的问题修正

### 3. 准备图标文件
确保 `build/` 目录下有以下图标：
- `icon.ico` (Windows)
- `icon.icns` (macOS)
- `icon.png` (Linux)

参考 `build/ICONS_README.md` 了解图标规格。

---

## 🔨 打包应用

### 方式 1：打包所有平台（需要对应系统）
```bash
npm run package
```

### 方式 2：打包单个平台

#### Windows（在 Windows 上）
```bash
npm run package:win
```
生成文件：`release/Achievo-Setup-0.1.0.exe`

#### macOS（在 macOS 上）
```bash
npm run package:mac
```
生成文件：
- `release/Achievo-0.1.0-x64.dmg` (Intel)
- `release/Achievo-0.1.0-arm64.dmg` (Apple Silicon)

#### Linux（在 Linux 上）
```bash
npm run package:linux
```
生成文件：`release/Achievo-0.1.0.AppImage`

---

## 📦 打包输出

打包成功后，`release/` 目录结构：
```
release/
├── Achievo-Setup-0.1.0.exe          # Windows 安装程序
├── Achievo-Setup-0.1.0.exe.blockmap
├── Achievo-0.1.0-x64.dmg            # macOS Intel 安装包
├── Achievo-0.1.0-arm64.dmg          # macOS Apple Silicon 安装包
├── Achievo-0.1.0.AppImage           # Linux 便携版
└── latest.yml / latest-mac.yml      # 自动更新配置
```

---

## 🚀 发布到 GitHub Releases

### 步骤 1：创建 Git 标签
```bash
# 提交所有更改
git add .
git commit -m "chore: release v0.1.0"

# 创建标签
git tag v0.1.0

# 推送到远程
git push origin main
git push origin v0.1.0
```

### 步骤 2：创建 GitHub Release

1. 访问 GitHub 仓库页面
2. 点击右侧 **Releases** → **Draft a new release**
3. 填写信息：
   - **Tag**: 选择 `v0.1.0`
   - **Title**: `Achievo v0.1.0`
   - **Description**: 复制下方模板

```markdown
## ✨ 新功能

- 🎯 智能代码评分系统（基础分 + AI 分 + 本地分）
- 📊 30 天趋势可视化图表
- 🤖 AI 代码总结（支持 OpenAI / DeepSeek）
- ⚡ 自动 Git 仓库追踪
- 🎨 现代化 UI 设计

## 📥 下载

选择适合你系统的版本：

- **Windows**: `Achievo-Setup-0.1.0.exe`
- **macOS (Intel)**: `Achievo-0.1.0-x64.dmg`
- **macOS (Apple Silicon)**: `Achievo-0.1.0-arm64.dmg`
- **Linux**: `Achievo-0.1.0.AppImage`

## 📖 使用说明

详见 [README.md](https://github.com/你的用户名/Achievo#readme)

## 🐛 已知问题

- 首次启动可能需要几秒加载时间
- macOS 用户可能需要在「系统偏好设置 → 安全性与隐私」中允许运行

## 🙏 致谢

感谢所有贡献者和测试用户！
```

4. 上传打包文件：
   - 将 `release/` 目录下的所有 `.exe`, `.dmg`, `.AppImage` 文件拖拽到 **Attach binaries** 区域

5. 点击 **Publish release**

---

## 🌐 其他发布渠道

### 1. 官网/个人博客
- 创建下载页面
- 提供直接下载链接
- 添加使用教程

### 2. 社交媒体推广
- Twitter / 微博
- Reddit (r/electronjs, r/reactjs)
- V2EX / 掘金 / 知乎

### 3. 产品发布平台
- Product Hunt
- Hacker News (Show HN)
- 少数派

---

## 🔄 自动更新（可选）

如需支持应用内自动更新，可集成 `electron-updater`：

```bash
npm install electron-updater
```

参考文档：https://www.electron.build/auto-update

---

## 📝 发布后任务

- [ ] 在 README 中更新下载链接
- [ ] 撰写发布公告（博客/社交媒体）
- [ ] 收集用户反馈
- [ ] 监控 GitHub Issues
- [ ] 规划下一版本功能

---

## ⚠️ 注意事项

1. **代码签名**（生产环境推荐）
   - Windows: 需要 Code Signing Certificate
   - macOS: 需要 Apple Developer 账号 + 证书

2. **安全扫描**
   - 使用 VirusTotal 扫描打包文件
   - 确保无误报

3. **测试**
   - 在干净的虚拟机中测试安装
   - 验证所有功能正常

4. **备份**
   - 保留所有版本的安装包
   - 记录每个版本的变更日志

---

## 📞 需要帮助？

- 查看 [Electron Builder 文档](https://www.electron.build/)
- 提交 Issue 到 GitHub
- 加入 Electron 社区讨论
