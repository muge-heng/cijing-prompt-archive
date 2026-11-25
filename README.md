# 词境仓库 · Prompt Archive

> **以纸张、木纹、黄铜索引柜为视觉隐喻的轻拟物多层级提示词管理与本地调试工作台**  
> 中国矿业大学首届“智核杯”AI创作大赛 · 赛道二（AI 网站创作赛道）作品｜参赛队名：**DeepSleep**｜成员：**林恒（09245213）**

![Version](https://img.shields.io/badge/version-v1.0.0-4a5d47?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16.4.5-2c3a28?style=flat-square)
![React](https://img.shields.io/badge/React-19.2.6-3e5a45?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-88693d?style=flat-square)
![Mode](https://img.shields.io/badge/Storage-PostgreSQL_%2B_localStorage-6d7265?style=flat-square)

---

## 在线访问与正式交付

- **GitHub Pages 在线预览（主力入口）**：https://muge-heng.github.io/cijing-prompt-archive/
- **豆包应用公网备用入口**：https://gcn58vaoybwh.doubao.link/app/app_17jpjswjb43
- **GitHub 开源仓库**：https://github.com/muge-heng/cijing-prompt-archive
- **正式交付 Release（`v1.0.0`，含静态离线部署包）**：https://github.com/muge-heng/cijing-prompt-archive/releases/tag/v1.0.0

---

## 界面实景预览

### 1. 暖纸日光 · 仓库总览与木质抽屉货架
![暖纸日光首页总览](docs/screenshots/overview-light.png)

### 2. 1240px 居中双栏对照工作台 · 模块化拼装与变量调试
![居中双栏对照工作台](docs/screenshots/workbench-split.png)

### 3. 深夜书房 · 低眩光暗色主题工作台
![深夜书房暗色首页](docs/screenshots/overview-dark.png)

---

## 核心特性一览

### 1. 四级物理归档层级与轻拟物空间感
- **四级空间结构**：围绕 **货架（Shelf）→ 文件夹（Folder）→ 提示词文档（PromptDoc）→ 结构化模块（PromptBlock）** 有序沉淀个人提示词资产。初次启用自动初始化 **3 个木纹货架、9 个文件夹、24 篇高质量中英模板示例**。
- **独立侧栏目录树**：`我的货架` 支持独立纵向滚动与平滑折叠文件夹目录树，底部配备可折叠「馆藏索引」票据实时统计馆藏规模。
- **细腻拟物转场**：提供开仓光影欢迎横幅（含北京时间问候语、公历、星期与农历），支持货架抽屉前拉（`drawer-pull-open`）与文件夹纸页翻起（`folder-sheet-open`）层叠动效。

### 2. 双模式写作与自定义板块预设库
- **模块拼装视图**：内置 6 类核心结构模块（角色设定、任务描述、背景信息、约束条件、输出格式、自由文本），支持拖拽手柄自由调序、上下移动、移除及离开草稿防误触保护。
- **完整输入 & Markdown 智能解析**：支持整段粘贴完整 Markdown 提示词（自动识别 `## 标题`、`[System] / [User]` 区块标记与围栏代码块隔离保护），与模块视图双向无损互通。遇到未匹配标题时弹出 `UnmatchedBlocksDialog`，可一键新建并沉淀至 **自定义板块预设库（`BlockPreset`）** 供跨文档复用。
- **一等 `System / User` 消息角色体系**：每个模块卡片标题栏配备可一键翻转的 **`SYS` / `USR` 徽标**，并在完整输入/导出时自动完成序列化对齐。

### 3. 本地变量调试引擎与版本回溯
- **`{{变量:默认值}}` 语法**：点击左侧快捷变量胶囊直接在光标处插入占位符；右侧调试区自动解析变量与默认值，支持 **最多 8 组调试样片** 一键保存与切换。
- **三态高亮预览与多格式复制**：带有横线信笺感的实时预览区清晰区分 **已填入 / 使用默认 / 待填写** 三种变量状态，实时估算中英混合 **Token 与字符数**，并支持一键切换并复制 **Markdown / 纯文本 / System / User** 三种输出格式。
- **档案修订签（LCS Diff）**：每次实质改动保存后自动保留最近 10 个历史版本快照，支持行级红绿差异对比与一键安全恢复。

### 4. 数据迁移、卡片导出与双端个性体验
- **2× 高清馆藏卡片导出**：通过纯 2D Canvas 实时绘制复古纸质/木纹索引卡片图像（支持切换暖纸日光/深夜书房与调试成稿/原始模板），支持一键复制图像或下载高清 `.png`。
- **全仓备份与单篇迁移**：通过左下角「私人工作空间」入口或文件拖拽，随时导出/导入全仓 `.json` 快照（支持智能合并重映射或整仓覆盖），或导入/导出标准 `.md` 单篇提示词。
- **双主题、四档动效与四档字号**：自由切换 **暖纸日光 / 深夜书房**、**舒缓典藏 / 丰富拟物（默认）/ 轻柔克制 / 关闭动效** 以及 **小号 / 标准 / 大号 / 超大** 四档全局字号，支持首屏防闪烁预加载与系统 `prefers-reduced-motion`。
- **完整移动端适配**：在 `390×844` 窄屏下自动切换为横向 `scroll-snap` 货架滑轨、侧边抽屉导航、全屏单栏标签工作台与自适应 `2×2` 设置控件网格。

---

## 双模式本地运行指南

本项目采用全同构存储架构，既支持 **零数据库纯前端静态部署**，也支持 **PostgreSQL 全栈持久化服务**。

### 模式 A：零数据库纯静态运行（推荐快速体验）
所有馆藏、自定义预设、调试样片与修订历史均持久化于浏览器 `localStorage`，开箱即用：

```bash
npm install
npm run build:pages
```

构建产物将生成于 `out/` 目录，可使用任意静态服务器本地预览（需按 `basePath` 挂载于 `/cijing-prompt-archive/` 或直接访问生成的静态目录）。

### 模式 B：全栈 PostgreSQL 开发与部署

1. 安装依赖：
   ```bash
   npm install
   ```
2. 在项目根目录配置 `.env` 文件，设置可访问的 PostgreSQL 连接串（勿提交密钥至版本库）：
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/prompt_archive
   ```
3. 推送 Drizzle ORM 数据库表结构：
   ```bash
   npx drizzle-kit push
   ```
4. 启动开发服务或生产构建：
   ```bash
   npm run dev
   # 或生产部署：
   npm run build && npm run start
   ```

> 安全提示：全栈模式为单工作空间架构，写接口均校验请求来源（Origin Check）。若用于公网多人访问私有提示词，建议在反向代理层增加鉴权访问控制。

---

## 常用快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| `Ctrl / ⌘ + K` | 打开全局全文检索弹窗（跨货架、文件夹与正文毫秒级检索） |
| `Ctrl / ⌘ + S` | 在提示词工作台中立即保存当前修改并写入档案修订签 |
| `Esc` | 逐层关闭当前顶层弹窗、右键操作菜单或移动端导航抽屉 |

---

## 项目结构概览

> 更深入的架构分层、Drizzle 四表设计与双模式同步流程图见 [架构说明文档 (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)。

- `src/db/schema.ts`：PostgreSQL 核心馆藏表、外键约束、索引及初始化标记。
- `src/lib/archive-types.ts`：共享领域模型、`SYS/USR` 角色解析、`{{变量:默认值}}` 编译器与 Token 估算。
- `src/lib/archive-markdown.ts`：完整输入 Markdown 标题、角色区块与代码块围栏隔离智能解析。
- `src/lib/archive-io.ts`：全仓 JSON 备份/智能合并、`.md` 导出导入、LCS 行级 Diff 与 2× Canvas 卡片绘制引擎。
- `src/lib/archive-store.ts` / `src/lib/archive-local-store.ts`：PostgreSQL Drizzle 事务引擎与全同构 `localStorage` 客户端引擎。
- `src/lib/archive-seed.ts` & `src/lib/archive-dates.ts`：3 货架 / 9 文件夹 / 24 篇示例初始化数据、北京时间问候与农历历法。
- `src/app/api/archive/route.ts` & `src/app/api/health/route.ts`：后端统一变更接口（含 Origin 校验）与数据库健康检查。
- `src/components/`：工作台主壳（`archive-app.tsx`）、双栏编辑器（`editor.tsx`）、预设库与智能匹配弹窗（`preset-dialog.tsx`）、备份/修订/卡片弹窗（`archive-io-dialog.tsx`）、自绘黄铜选择器（`archive-select.tsx`）、设置与检索弹窗（`archive-dialogs.tsx`）及全套自绘 SVG 图标（`icons.tsx`）。
- `src/app/{globals,workspace,workbench,responsive}.css`：暖纸/暗木设计变量、馆藏空间样式、双栏工作台、动效关键帧及移动端响应式规则。
- `scripts/build-pages.mjs`：GitHub Pages 静态双模式自动化构建脚本。
- `public/images/` & `public/fonts/`：原创档案室日/夜景铜版画插画、纹理及本地子集化字体资源。

---

## 版本演进摘要

| 版本 | 核心里程碑 |
| :--- | :--- |
| **`v0.1.0`** | 确立轻拟物视觉原型与四级归档底座，补齐架构文档、原创日夜景插画、本地字体子集及 GitHub Pages 双模式上线 |
| **`v0.2.0`** | 侧栏货架独立纵向滚动、平滑折叠文件夹目录树、开仓层叠动画三档调节、全自绘 `ArchiveSelect` 下拉组件 |
| **`v0.3.0`** | 重构桌面端 `1240px` 居中宽幅双栏工作台；新增自定义板块预设库与「完整输入」Markdown 智能解析弹窗 |
| **`v0.4.0`** | 浏览器巡检驱动全面升级：全仓 JSON/`.md` 备份导入、`{{变量:默认值}}` 与调试样片、LCS Diff 修订签、拖拽排序、2× PNG 卡片导出 |
| **`v0.4.1`** | 全链路一等 `System / User` 消息角色体系（`SYS/USR` 卡片切换胶囊、预设默认角色绑定、围栏代码安全解析） |
| **`v0.4.2`** | 新增第 4 档「舒缓典藏」动效、4 档界面字号与自适应横线信笺；清除移动端品牌区冗余关闭键并修复拼装箭头翻转 |
| **`v1.0.0`** | 完成全量构建、双端双主题与离线包验收，正式交付参赛发布版 |

---

## 开发构建与验证命令

```bash
# 类型检查与代码规范校验
npx next typegen
npm run typecheck
npm run lint

# 验证纯静态 Pages 构建（输出至 out/）
npm run build:pages

# 全栈构建与 Playwright 端到端验收（需已配置 DATABASE_URL 并安装 Chromium）
npm run build
npx playwright install chromium --with-deps
npx playwright test tests/archive.spec.ts --workers=1
```

健康检查接口：`GET /api/health`（执行真实数据库连接查询验证）。

---

## 素材与开源许可说明

- **视觉与图形资产**：档案室日景 / 夜景铜版画风插画、木纹/纸纹底图、抽屉、拉手与全套功能图标均为本项目原创或手绘 SVG 生成，**零外部图标/Emoji 依赖**。
- **字体许可**：界面内置本地子集化 **Noto Sans SC** 与 **Noto Serif SC**，遵循 SIL Open Font License 1.1，完整许可文本见 `public/fonts/` 目录。
