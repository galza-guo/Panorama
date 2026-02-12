<div align="center">
  <a href="https://github.com/galza-guo/Panorama">
    <img src="public/logo.svg" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Panorama</h3>

  <p align="center">
    您的全能桌面投资追踪器，深度支持中国市场
    <br />
    <br />
    <a href="https://github.com/galza-guo/Panorama/releases">下载发布版</a>
  </p>
</div>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

## 简介

**Panorama App**
是您的全能桌面投资追踪器，深度支持中国市场，支持完全的**本地数据存储**。**无订阅费，无云端依赖**。

Panorama 是 [Wealthfolio](https://github.com/afadil/wealthfolio)
的一个透明 Fork 版本，并根据 AGPL-3.0 协议保留了上游的归属说明。

![Screenshot](public/screenshot.webp)

### 🚀 Panorama 特色功能

Panorama 在 Wealthfolio 坚实的基础上，针对亚洲市场和更多资产类别进行了增强支持：

- **🇨🇳 中国股票支持**：原生支持 **A股**，并接入经过验证的数据源。
- **📈 全面的基金数据**：支持 **公募基金** 和 **场外基金**，数据由 **东方财富**
  和 **天天基金** 驱动。
- **💱 增强的汇率数据**：来自 **OXR** 的可靠汇率数据源。
- **🇭🇰 香港强积金 (MPF)** - 专门追踪 MPF 资产详情。
- **🛡️ 保险追踪**：全新支持全面的保险保单管理。
- **💎 替代资产**：追踪贵金属、加密货币等非传统资产，支持手动估值更新。
- **✨ 更多功能**：持续的改进和本地化适配。

### ✨ 核心功能

- **📊 投资组合追踪** - 跨多个账户和资产类型追踪您的投资
- **📈 绩效分析** - 详细的绩效指标和历史分析
- **💰 交易活动管理** - 导入和管理您的所有交易活动
- **🎯 目标规划** - 设定并追踪财务目标及资产配置管理
- **🔒 本地数据** - 所有数据存储在本地，不依赖云端
- **🧩 可扩展性** - 强大的插件系统，支持自定义功能
- **🌍 多货币支持** - 支持多种货币及汇率管理
- **📱 跨平台** - 支持 Windows、macOS 和 Linux

### 🧩 插件系统

Panorama 拥有强大的插件系统，允许开发者扩展功能：

- **🔌 开发简便** - TypeScript SDK，拥有完整的类型安全和热重载支持
- **🔒 安全** - 全面的权限系统，需用户同意
- **⚡ 高性能** - 针对速度进行了优化，开销极低
- **🎨 UI 集成** - 添加自定义页面、导航项和组件
- **📡 实时事件** - 监听投资组合更新、市场同步和用户操作
- **🗄️ 完整数据访问** - 访问账户、持仓、活动和市场数据
- **🔐 密钥管理** - 安全存储 API 密钥和敏感数据

**开始构建插件：** 请参阅 [插件文档中心](docs/addons/index.md)

所有支持的活动类型及其所需表单字段的文档可在
[docs/concepts/activity-types.md](docs/concepts/activity-types.md) 中找到。

## 路线图 (Roadmap)

请参阅 [ROADMAP.md](./ROADMAP.md)。

## 📖 文档

### 核心应用

- **[活动类型](docs/concepts/activity-types.md)** - 所有支持的活动类型及其所需字段的完整指南
- **[路线图](ROADMAP.md)** - 未来计划和开发路线图

### 插件开发

- **[插件文档中心](docs/addons/index.md)** - 插件开发的主要入口
- **[入门指南](docs/addons/getting-started.md)** - 插件开发入门指南
- **[API 参考](docs/addons/api-reference.md)** - 包含示例的完整 API 文档
- **[架构](docs/addons/architecture.md)** - 设计模式和架构指南

### 快速链接

- 💡 **[示例插件](addons/)** - 浏览仓库中的示例插件
- 🛠️ **[开发工具](packages/addon-dev-tools/)** - 用于插件开发的命令行工具

## 快速开始

### 前提条件

确保您的机器上安装了以下软件：

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)
- [Tauri](https://tauri.app/)

### 从源码构建

1. **克隆仓库**:

   ```bash
   git clone https://github.com/galza-guo/Panorama.git
   cd panorama
   ```

2. **使用 pnpm 安装依赖**:

   ```bash
   pnpm install
   ```

3. **设置环境配置**:

   复制环境模板并根据您的设置进行配置：

   ```bash
   cp .env.example .env
   ```

   更新 `.env` 文件中的数据库路径和其他配置：

   ```bash
   # Database location
   DATABASE_URL=../db/panorama.db
   ```

4. **在开发模式下运行**:

   使用 Tauri 构建并运行桌面应用程序：

   ```bash
   pnpm tauri dev
   ```

#### 插件开发模式

插件热重载服务器现在仅在您明确选择时启动。

**用于 Tauri 桌面开发：**

```bash
VITE_ENABLE_ADDON_DEV_MODE=true pnpm tauri dev
```

**仅浏览器开发 (Vite only, no Tauri)：**

```bash
pnpm dev:addons
```

您也可以在 `.env` 文件中设置 `VITE_ENABLE_ADDON_DEV_MODE=true` 以持久化该设置。

5. **构建生产版本**:

   构建用于生产环境的应用程序：

   ```bash
   pnpm tauri build
   ```

### Web 模式 (浏览器 + REST API 服务器)

使用一条命令运行带有本地 Axum 服务器的 Web UI。

#### 快速开始

1. **设置环境** (可选但推荐):

   复制示例环境文件并根据您的设置进行自定义：

   ```bash
   cp .env.web.example .env.web
   ```

   编辑 `.env.web` 以配置数据库路径、端口和其他设置。

2. **启动后端和 Vite 开发服务器**:

   ```bash
   pnpm run dev:web
   ```

   Vite 开发服务器运行在
   `http://localhost:1420`，并将 API 调用代理到 Axum 后端服务器。

#### 配置

所有配置均通过 `.env.web` 中的环境变量完成。

**服务器配置 (WF\_\* 变量)**:

- `WF_LISTEN_ADDR` - 服务器绑定地址 (默认: `0.0.0.0:8080`)
- `WF_DB_PATH` - SQLite 数据库路径或目录 (默认: `./db/app.db`)
  - 如果提供的是目录，将在其中使用 `app.db`
- `WF_CORS_ALLOW_ORIGINS` - 允许的 CORS 来源（逗号分隔） (默认: `*`)
  - 示例: `http://localhost:1420,http://localhost:3000`
- `WF_REQUEST_TIMEOUT_MS` - 请求超时时间（毫秒） (默认: `30000`)
- `WF_STATIC_DIR` - 提供静态前端资源的目录 (默认: `dist`)
- `WF_SECRET_KEY` - **必需** 32字节密钥，用于密钥加密和 JWT 签名
- `WF_AUTH_PASSWORD_HASH` - Argon2id PHC 字符串，启用 Web 模式的密码验证
- `WF_AUTH_TOKEN_TTL_MINUTES` - 可选的 JWT 访问令牌过期时间（分钟） (默认 `60`)
  - 生成命令: `openssl rand -base64 32`
- `WF_SECRET_FILE` - **可选** 密钥存储文件路径 (默认:
  `<data-root>/secrets.json`)
- `WF_ADDONS_DIR` - **可选** 插件目录路径 (默认: 根据数据库路径派生)

**Vite 配置**:

- `VITE_API_TARGET` - Vite 代理的后端 API URL (默认: `http://127.0.0.1:8080`)

#### 认证 (Web 模式)

- 将 `WF_AUTH_PASSWORD_HASH` 设置为 Argon2id PHC 字符串，以在访问 Web
  App 前要求密码。

  您可以使用在线工具如 [argon2.online](argon2.online) 或以下命令生成哈希：

  ```bash
  argon2 "your-password" -id -e
  ```

  复制完整输出 (以 `$argon2id$...` 开头) 到 `.env.web`。

- 令牌是短期的（默认 60 分钟）并存储在客户端内存中；刷新页面需重新认证。

#### 注意事项

- 服务器在启动时会记录有效的数据库路径
- `.env.web` 中的环境变量由 `dev:web` 脚本自动加载
- 使用 Ctrl+C 可优雅地关闭两个进程

### 仅服务器

运行不带 Vite 开发服务器的 HTTP 服务器 (从仓库根目录)：

```bash
cargo run --manifest-path src-server/Cargo.toml
```

服务器接受与上述 [Web 模式配置](#configuration) 部分相同的 `WF_*`
环境变量。您可以内联设置或通过 `.env.web` 设置：

```bash
WF_LISTEN_ADDR=127.0.0.1:8080 WF_DB_PATH=./db/app.db cargo run --manifest-path src-server/Cargo.toml
```

请参阅 [Web 模式配置](#configuration) 获取支持的环境变量完整列表。

## Docker

您可以拉取官方 Docker 镜像或自己在本地构建。

### 使用预构建镜像

最新的服务器构建已发布到 Docker Hub。

```bash
docker pull galza-guo/panorama:latest
```

拉取后，在下面的运行命令中使用
`galza-guo/panorama:latest`。如果您在本地构建镜像，请将镜像名称换回 `panorama`。

### 构建镜像

直接从源码构建 Docker 镜像 (无需预先构建)：

```bash
docker build -t panorama .
```

构建过程：

1. 从源码构建前端资源 (`pnpm install` + `pnpm vite build`)
2. 从源码编译 Rust 后端 (`cargo build --release`)
3. 创建包含仅运行时工件的最小 Alpine 基础镜像

最终镜像包含：

- 位于 `/app/dist` 的编译后前端资源
- 位于 `/usr/local/bin/panorama-server` 的 `panorama-server` 二进制文件
- Alpine Linux 基础系统 (占用空间小)

### 配置

您可以使用以下任一方式配置容器：

1. **环境变量** (使用 `-e` 标志内联)
2. **环境文件** (使用 `--env-file` 标志)

**选项 1: 创建环境文件** (推荐用于生产环境):

```bash
# Create a Docker-specific environment file
cat > .env.docker << 'EOF'
WF_LISTEN_ADDR=0.0.0.0:8088
WF_DB_PATH=/data/panorama.db
WF_SECRET_KEY=<generate-with-openssl-rand>
WF_CORS_ALLOW_ORIGINS=*
WF_REQUEST_TIMEOUT_MS=30000
WF_STATIC_DIR=dist
EOF
```

生成并添加您的密钥：

```bash
echo "WF_SECRET_KEY=$(openssl rand -base64 32)" >> .env.docker
```

**选项 2: 使用内联环境变量** (测试更简单):

参阅下方的内联配置示例。

### 运行容器

以下所有示例均使用发布的镜像 (`galza-guo/panorama:latest`)。如果您在本地构建，请替换为您本地的标签 (如
`panorama`)。

**使用环境文件** (推荐):

```bash
docker run --rm -d \
  --name panorama \
  --env-file .env.docker \
  -p 8088:8088 \
  -v "$(pwd)/panorama-data:/data" \
  galza-guo/panorama:latest
```

**基本用法** (内联环境变量):

```bash
docker run --rm -d \
  --name panorama \
  -e WF_LISTEN_ADDR=0.0.0.0:8088 \
  -e WF_DB_PATH=/data/panorama.db \
  -p 8088:8088 \
  -v "$(pwd)/panorama-data:/data" \
  galza-guo/panorama:latest
```

**开发模式** (带 CORS 以支持本地 Vite 开发服务器):

```bash
docker run --rm -it \
  --name panorama \
  -e WF_LISTEN_ADDR=0.0.0.0:8088 \
  -e WF_DB_PATH=/data/panorama.db \
  -e WF_CORS_ALLOW_ORIGINS=http://localhost:1420 \
  -p 8088:8088 \
  -v "$(pwd)/panorama-data:/data" \
  galza-guo/panorama:latest
```

**加密的生产环境** (推荐):

```bash
docker run --rm -d \
  --name panorama \
  -e WF_LISTEN_ADDR=0.0.0.0:8088 \
  -e WF_DB_PATH=/data/panorama.db \
  -e WF_SECRET_KEY=$(openssl rand -base64 32) \
  -p 8088:8088 \
  -v "$(pwd)/panorama-data:/data" \
  galza-guo/panorama:latest
```

### 环境变量

容器支持 [Web 模式配置](#configuration) 部分记录的所有 `WF_*`
环境变量。关键变量：

- `WF_LISTEN_ADDR` - 绑定地址 (**Docker 中必须使用 `0.0.0.0:PORT`**，而不是
  `127.0.0.1`)
- `WF_DB_PATH` - 数据库路径 (通常为 `/data/panorama.db`)
- `WF_CORS_ALLOW_ORIGINS` - CORS 来源 (用于开发/前端访问设置)
- `WF_SECRET_KEY` - 必需的 32 字节密钥，用于密钥加密和 JWT 签名

### 卷 (Volumes)

- `/data` - 数据库和密钥的持久存储
  - 数据库: `/data/panorama.db`
  - 密钥: `/data/secrets.json` (使用 `WF_SECRET_KEY` 加密)

### 端口

- `8088` - HTTP 服务器 (同时提供 API 和静态前端)

启动容器后，通过 `http://localhost:8088` 访问应用程序。

**重要:** 服务器必须在容器内绑定到 `0.0.0.0`
(所有接口)，以便从宿主机访问。绑定到 `127.0.0.1` 将使应用仅在容器内部可访问。

### 使用 DevContainer 开发

为了在所有平台上获得一致的开发环境，您可以使用提供的 DevContainer 配置。此方法需要的全手动设置步骤更少，并提供了一个包含所有必要依赖项的隔离环境。

#### 前提条件

- [Docker](https://www.docker.com/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
  VS Code 扩展

#### 特性

- 预配置的 Tauri 开发环境
- 带 VNC 访问的 X11 虚拟显示器 (端口 5900)
- 完整的 Rust 开发设置
- GPU 支持 (通过 Docker 的 --gpus=all 标志)
- 持久的数据和构建缓存
- 预安装的基本 VS Code 扩展

#### 使用 DevContainer 开始开发

1. **克隆仓库** (如果尚未克隆):
   ```bash
   git clone https://github.com/galza-guo/Panorama.git
   cd panorama
   ```
2. **在 VS Code 中打开**:
   - 打开 VS Code
   - 转到 文件 > 打开文件夹
   - 选择 panorama 目录

3. **启动 DevContainer**:
   - 按 `F1` 或 `Ctrl+Shift+P`
   - 输入 "Remote-Containers: Reopen in Container"
   - 按回车

4. **等待容器构建**:
   - VS Code 将构建并配置开发容器
   - 第一次运行可能需要几分钟

5. **开始开发**:
   - 一旦容器准备就绪，您就可以开始开发了
   - 所有必要的工具和依赖项都将可用

## 插件开发

Panorama 支持强大的插件生态系统，允许开发者使用自定义功能扩展应用。

### 插件快速开始

1. **创建新插件**:

   ```bash
   npx @panorama/addon-dev-tools create my-addon
   cd my-addon
   npm install
   ```

2. **启动开发服务器**:

   ```bash
   npm run dev:server
   ```

3. **在插件开发模式下启动 Panorama** (在另一个终端中):
   ```bash
   VITE_ENABLE_ADDON_DEV_MODE=true pnpm tauri dev
   ```

您的插件将被自动发现并加载，且支持热重载！

### 插件特性

- **🎨 UI 集成**: 添加自定义页面和导航项
- **📊 数据访问**: 完全访问投资组合、账户和市场数据
- **📡 实时事件**: 响应投资组合更新和用户操作
- **🔐 安全存储**: 安全存储 API 密钥和敏感数据
- **⚡ 热重载**: 无缝的开发体验
- **🔒 权限系统**: 透明的安全机制，需用户同意

### 示例插件

查看 [addons/](addons/) 目录下的示例插件，包括：

- **Goal Progress Tracker**: 带有日历界面的可视化目标追踪
- **Investment Fees Tracker**: 追踪并分析投资费用
- **Swingfolio**: 高级波段交易追踪器，支持绩效分析、日历视图和 FIFO/LIFO 仓位匹配

### 资源

- **[入门指南](docs/addons/getting-started.md)** - 开始构建插件所需的一切知识
- **[API 参考](docs/addons/api-reference.md)** - 完整的 API 文档
- **[架构指南](docs/addons/architecture.md)** - 设计模式和最佳实践

## 使用的技术

### 前端

- **React**: 用于构建用户界面的 JavaScript 库。
- **React Router**: React 的声明式路由。
- **Tailwind CSS**: 用于样式的实用优先 CSS 框架。
- **Radix UI/Shadcn**: 无障碍 UI 组件。
- **Recharts**: 基于 React 构建的图表库。
- **React Query**: React 的数据获取库。
- **Zod**: TypeScript 优先的模式声明和验证库。

### 后端

- **Tauri**: 用于构建小巧、安全且快速的桌面应用程序的框架。
- **Rust**: 用于核心后端功能的系统编程语言。
- **SQLite**: 用于本地数据存储的嵌入式数据库。
- **Diesel**: Rust 的安全、可扩展 ORM 和查询构建器。

### 插件系统

- **@panorama/addon-sdk**: 用于插件开发的 TypeScript SDK，具有完全的类型安全。
- **@panorama/addon-dev-tools**: CLI 工具和支持热重载的开发服务器。
- **@panorama/ui**: 用于一致样式的共享 UI 组件库。

### 开发工具

- **Vite**: 下一代前端工具。
- **TypeScript**: JavaScript 的类型化超集。
- **ESLint**: JavaScript 和 JSX 的可插拔 Linting 工具。
- **Prettier**: 代码格式化工具。
- **pnpm**: 快速、节省磁盘空间的包管理器。
- **Turborepo**: 用于 JavaScript 和 TypeScript 代码库的高性能构建系统。

## 文件夹结构

```
panorama/
├── src/                         # React 应用程序的主要源代码
│   ├── addons/                  # 插件系统核心功能
│   ├── components/              # React 组件
│   ├── pages/                   # 应用程序页面和路由
│   ├── hooks/                   # 自定义 React hooks
│   └── lib/                     # 工具库和助手函数
├── src-core/                    # 核心后端功能 (Rust)
├── src-tauri/                   # 桌面应用功能的 Tauri 特定代码
├── addons/                      # 示例和样本插件
│   └── goal-progress-tracker/   # 目标进度追踪器插件示例
├── packages/                    # 共享包和工具
│   ├── addon-sdk/               # 开发者使用的插件 SDK
│   ├── addon-dev-tools/         # 开发工具和 CLI
│   └── ui/                      # 共享 UI 组件库
├── docs/                        # 文档
│   ├── addons/                  # 插件开发文档
│   └── activities/              # 活动类型文档
├── public/                      # 公共资源
├── db/                          # 数据库文件和迁移
├── LICENSE                      # 许可证文件
├── README.md                    # 项目文档
├── ROADMAP.md                   # 未来计划和路线图
│
├── packages/ui/components.json  # Shadcn UI 生成器配置 (monorepo)
├── package.json                 # Node.js 依赖项和脚本
├── pnpm-lock.yaml               # pnpm 锁定文件
├── postcss.config.js            # PostCSS 配置
├── tailwind.config.js           # Tailwind CSS 配置
├── tsconfig.json                # TypeScript 配置
└── vite.config.ts               # Vite 构建工具配置
```

### 安全与数据存储

#### 本地数据存储

您的所有财务数据都使用 SQLite 数据库存储在本地，没有云端依赖：

- 投资组合持仓和绩效数据
- 交易活动和历史记录
- 账户信息和设置
- 目标和供款限额

#### API 密钥与机密

API 凭据使用 `keyring` crate 通过操作系统密钥环安全存储：

- **核心应用**: 使用 `set_secret` 和 `get_secret` 命令访问外部服务
- **插件**: 使用 Secrets API (`ctx.api.secrets`) 处理插件特定的敏感数据
- **无磁盘存储**: 密钥从未写入磁盘或配置文件

#### 权限系统

插件在全面的权限系统下运行：

- 安装期间自动代码分析
- 数据访问需用户同意
- 基于风险的安全警告
- 透明的权限声明

## 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库。
2. 创建一个新分支 (`git checkout -b feature-branch`)。
3. 提交您的更改。
4. 提交您的更改 (`git commit -m 'Add some feature'`)。
5. 推送到该分支 (`git push origin feature-branch`)。
6. 发起 Pull Request。

## 许可证

本项目采用 AGPL-3.0 许可证。详情请参阅 `LICENSE` 文件。

## 🌟 Star 历史

## [![Star History Chart](https://api.star-history.com/svg?repos=galza-guo/panorama&type=Timeline)](https://star-history.com/#galza-guo/panorama&Date)

享受使用 **Panorama** 管理您的财富吧！ 🚀
