# 词境仓库 · Prompt Archive

以纸张、木纹、黄铜索引柜为视觉语言的个人提示词工作台。基于 Next.js App Router、React、TypeScript、PostgreSQL 与 Drizzle ORM。所有馆藏数据持久化到数据库，不依赖浏览器存储保存文档。

## 使用

- **归档层级**：货架 → 文件夹 → 提示词。初次启动会建立 3 个货架、9 个文件夹及 24 篇可编辑示例，只初始化一次。
- **整理**：创建、重命名或删除货架与文件夹；在编辑器的「归档位置」移动文档。删除上级容器前会明确提示受影响文档数。
- **编写**：拼装角色、任务、背景、约束、格式及自由文本模块，支持上下移动、移除、手动保存和离开草稿保护。
- **调试**：在文本中写入 `{{变量名}}`，切至「变量调试」填入参数，即可预览、检查未填变量并复制最终文本。这是可离线计算的模板调试，不会请求第三方语言模型。
- **找回**：全文检索、收藏、最近访问、货架筛选、标题及编辑时间排序。
- **偏好**：暖纸日光／深夜书房；入仓过渡和界面动效可独立关闭，遵守系统 `prefers-reduced-motion`。设备偏好仅存在 localStorage。
- **快捷键**：`Ctrl / ⌘ + K` 搜索，`Ctrl / ⌘ + S` 保存，`Esc` 关闭弹层。

## 本地运行

1. 安装依赖 `npm install`。
2. 在 `.env` 中设置 `DATABASE_URL`，指向可访问的 PostgreSQL 数据库。不要将数据库密钥提交到版本控制。
3. 执行 `npx drizzle-kit push` 应用表结构。
4. `npm run dev` 运行开发版；生产部署使用 `npm run build` 和平台的启动流程。

这是一个单工作空间应用。多人共享同一个部署会看到同一份馆藏；收藏与访问记录也在工作空间内共享。部署私人或敏感文档时，应在服务前配置登录访问控制。客户端不持有数据库连接信息。

## 结构

- `src/db/schema.ts`：馆藏表、外键约束、索引及一次性初始化标记。
- `src/lib/archive-store.ts`：事务化初始化、请求校验和 Drizzle 读写。
- `src/lib/archive-types.ts`：共享类型、模块模板与变量编译。
- `src/lib/archive-seed.ts`：示例馆藏。
- `src/lib/archive-dates.ts`：北京时间问候、公历与农历展示。
- `src/app/api/archive/route.ts`：读取及变更接口；检查写请求来源，返回结构化错误。
- `src/components`：主工作台、货架、文档表、编辑器、搜索与偏好弹层、自绘 SVG。
- `src/app/{globals,workspace,workbench,responsive}.css`：设计变量、馆藏界面、工作台和响应式规则。
- `public/images`、`public/fonts`：本地插画、纹理和字体子集，无运行时外部素材依赖。

## 验证

依次运行 `npx next typegen`、`npm exec tsc -- --noEmit --pretty false`、`npm run build`。

生产预览启动后，安装浏览器 `npx playwright install chromium --with-deps`，执行 `npx playwright test tests/archive.spec.ts --workers=1`。测试覆盖真实增删改查、层级归档、模块排序、变量编译、剪贴板、刷新持久化、移动端主题和服务端校验，并清理测试馆藏。可通过 `ARCHIVE_TEST_URL` 指定受测地址。

健康检查：`GET /api/health`（实际执行数据库查询）。

## 素材

档案室日景、夜景为本项目生成的原创插画；图标、抽屉、铭牌、拉手及纹理均在本项目内绘制。界面使用 Noto Sans SC、Noto Serif SC 的本地子集，遵循 SIL Open Font License，许可证见 `public/fonts/`。
