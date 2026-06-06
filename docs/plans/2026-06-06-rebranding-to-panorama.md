# Panorama (去Wealthfolio化) 完整重命名实施计划

这是一个针对整个Monorepo的彻底“去Wealthfolio化”的实施计划。除了简单地全局替换字符串之外，要做到**干净可靠**，必须处理包管理、系统目录迁移、深层配置和外部依赖。全局搜索显示有650多处遗留的 `wealthfolio` 引用。

## User Review Required

> [!CAUTION]
> **最关键的风险：用户数据丢失（由于Tauri Identifier变更）**
> 目前 `tauri.conf.json` 中的 `identifier` 已经变更为 `com.gallantguo.panorama`。
> 
> 在操作系统层面，Tauri应用的本地存储（如SQLite数据库、配置文件）路径依赖于这个Identifier。
> - 旧 identifier: `com.teymz.wealthfolio`
> - 新 identifier: `com.gallantguo.panorama`
> - macOS 当前示例路径: `~/Library/Application Support/com.gallantguo.panorama/app.db`
> 
> **如果老用户来自旧 Wealthfolio identifier，App 会读取新目录下的 `app.db`，旧数据看起来会“消失”。**
> 迁移逻辑必须在 `db::init` 之前运行，并且要处理 `app.db`、`app.db-wal`、`app.db-shm`。

> [!IMPORTANT]
> **Wealthfolio Connect 不做重命名，直接移除**
> Panorama 没有对应的 Connect 云服务，也没有 `Panorama Connect`。旧的 Wealthfolio Connect 依赖外部服务、OAuth、deep link 和远端 API，当前项目不应继续保留或重命名这些功能。

## Open Questions

1. **数据迁移策略**：是否迁移整个旧 app-data 目录，还是只迁移 `app.db` / WAL / SHM？推荐迁移整个目录中的数据库、`backups/`、`addons/` 等本地数据，但不覆盖新目录中已存在的数据。
2. **NPM Package Scope**：是否将 `@wealthfolio/*` 统一更改为 `@panorama/*`？或者直接去掉前缀变成普通的本地 workspace 包？
3. **环境变量前缀**：是否将 server/web mode 的 `WF_*` 环境变量改为 `PANORAMA_*`？推荐新变量用 `PANORAMA_*`，同时保留 `WF_*` 作为兼容 fallback，避免现有部署误开一个新数据库。
4. **SecretStore 前缀**：`wealthfolio_` keychain 前缀是否改为 `panorama_`？如果改，必须读取旧 key 作为 fallback 并迁移，否则市场数据 API key、Webull HK 凭据等会看起来丢失。

---

## Proposed Changes

为了保证安全，我们将分模块进行清理，按依赖关系从底向上实施：

### 1. 核心架构与应用标识 (Tauri & Rust)

- **Tauri配置清理**：统一 `apps/tauri/tauri.conf.json`、generated iOS/macOS config、bundle id、product name、binary name。目标 identifier 固定为 `com.gallantguo.panorama`。
- **移除 Deep Link / Connect 配置**：删除 `wealthfolio://` scheme、`connect.wealthfolio.app` applinks、Connect OAuth callback 配置。不要新增 `panorama://`，除非未来真的有 Panorama 自有服务需要它。
- **数据自动迁移 (Rust)**：在 Tauri 初始化阶段、`db::init` 之前，检测旧 `com.teymz.wealthfolio` app-data 目录。如果新 `app.db` 不存在，则安全复制旧 `app.db`、`app.db-wal`、`app.db-shm`，并尽量迁移 `backups/`、`addons/` 等本地数据。不要只搜索 `.sqlite`。
- **Rust Crates 重命名**：检查并修改所有 `Cargo.toml` 中定义的 package name，如果存在 `wealthfolio-server` 等，将其重命名，并全局替换 Rust 代码中的 `use wealthfolio_xxx::` 导入。

### 2. NPM包管理器生态 (Workspaces & Addons)

- **Root `package.json`**: 将 `name` 改为 `panorama-app`。
- **UI & SDK 包名**:
  - `packages/ui`: `name` 改为 `@panorama/ui`
  - `packages/addon-sdk`: `name` 改为 `@panorama/addon-sdk`
- **依赖导入更新**: 对 `apps/frontend` 及所有 `addons/*` 进行全局搜索，将 `import { ... } from '@wealthfolio/...'` 统一替换为 `@panorama/...`。
- **Addon兼容性**：`minWealthfolioVersion` 和 `@wealthfolio/addon-sdk` 是已有 addon 兼容面。若改名，应支持旧 manifest 字段和旧 package 名一段时间，或明确这是 breaking change。

### 3. 前端与业务逻辑 (React & TypeScript)

#### [REMOVE] `apps/frontend/src/features/wealthfolio-connect/`
删除 Wealthfolio Connect，而不是重命名为 Panorama Connect：
- 删除 `WealthfolioConnectProvider`、Connect 页面、Connect sync UI、Connect visibility gate、broker cloud sync hooks/services。
- 删除 `wealthfolioConnectVisible` 相关 UI。如果保留数据库设置 key，仅作为旧数据兼容字段，不再对用户展示。
- 删除 `WEALTHFOLIO_CONNECT_PORTAL_URL`、`auth.wealthfolio.app`、`connect.wealthfolio.app`、OAuth callback、hosted deep-link bounce 相关常量。
- 删除 Tauri/Web Connect commands、Connect cloud client wiring、不可访问的远端 API 依赖。

#### [MODIFY] 环境变量与常量
- 更新 `apps/frontend/src/lib/constants.ts` 等文件中的硬编码名称。
- 更新 `.env.example` / `.env.web.example`，移除 Connect 变量；新增 `PANORAMA_*` 示例，并保留 `WF_*` fallback 说明。
- 更新 SecretStore 前缀时保留旧 `wealthfolio_` 读取 fallback，避免非 Connect 凭据丢失。

### 4. CI/CD 与 运维文档 (GitHub Actions)

- **Workflows**: 清理 `.github/workflows/` 下 release/build 脚本里可能存在的镜像名称、artifact名称中的 `wealthfolio` 字样。
- **文档**: 更新 `README.md`, `CLAUDE.md`, `TRADEMARKS.md` 等，确保对外部贡献者和用户的品牌展示一致。

---

## Verification Plan

### Automated Tests
- 执行 `pnpm check` 验证TypeScript类型没有因为包名更改而中断。
- 执行 `pnpm test` 和 `cargo test` 确保业务逻辑通过。
- 增加/执行迁移测试：旧目录含 `app.db` + WAL/SHM 时，新版本能在 `db::init` 前迁移并读取旧数据。
- 增加/执行 server env 测试：`PANORAMA_DB_PATH` 优先，`WF_DB_PATH` fallback 仍可读取同一个数据库。

### Manual Verification
- **全新安装测试**：编译 Tauri 应用，确认在新机器上能够正常启动，数据库正确创建在 `com.gallantguo.panorama` 目录下。
- **迁移测试（核心）**：
  1. 手动在 `com.teymz.wealthfolio` 对应的系统目录下创建假数据（或使用真实旧版数据）。
  2. 启动新版本 `Panorama`。
  3. 验证应用是否能够自动识别旧数据、成功复制到新目录，并顺利加载用户资产信息，不发生数据丢失。
  4. 验证新目录已存在非空数据库时不会被旧数据覆盖。
- **Connect 移除测试**：确认 UI 中不再出现 Wealthfolio Connect / Panorama Connect；启动和构建不依赖 `auth.wealthfolio.app`、`connect.wealthfolio.app` 或 `wealthfolio://`。
