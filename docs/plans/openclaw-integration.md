# 📜 项目计划：Panorama x OpenClaw 自动化财经简报

## 1. 背景与目的 (Background & Motivation)
用户目前使用 **Panorama** 追踪中国（A股、基金）及海外市场的投资组合。由于 Panorama 是一个本地桌面应用，用户需要手动开启并同步才能查看资产波动。
**目的**：利用 OpenClaw 的常驻属性和 Telegram 机器人，通过调用 Panorama 的核心计算逻辑，实现每日早晨自动推送资产简报（PnL、涨跌异动、市场点评），让用户在不开启 App 的情况下掌握资产动态。

## 2. 核心架构设计 (The "Aria-CLI" Pattern)

### 阶段一：Panorama 侧（逻辑提供者）
在 Panorama 的 Rust 核心层（`src-core`）增加轻量级 CLI 入口。

*   **新增功能**：
    *   `--sync`：静默启动数据同步任务（调用 `EastMoney` 和 `TiantianFund` 接口）。
    *   `--report --date <YYYY-MM-DD>`：计算指定日期的估值，并以结构化 JSON 格式输出到 stdout。
*   **JSON 输出格式示例**：
    ```json
    {
      "total_value": 346831.23,
      "pnl_absolute": 1205.40,
      "pnl_percent": 0.35,
      "top_gainers": [{"symbol": "513050.SH", "change": 2.1}],
      "top_losers": [{"symbol": "006105.FUND", "change": -1.2}],
      "cash_balance": 15000.00
    }
    ```

### 阶段二：OpenClaw 侧（分析与编排者）
编写 OpenClaw Skill，负责调用上述 CLI 并加工信息。

*   **工作流 (Cron Job @ 9:00 AM)**：
    1.  **触发同步**：执行 `panorama-cli --sync`。
    2.  **获取数据**：执行 `panorama-cli --report --date yesterday` 获取 JSON。
    3.  **市场关联 (Aria Reasoning)**：
        *   如果发现纳指 ETF 大涨，OpenClaw 会调用 `Brave Search` 搜索“昨天美股大涨原因”。
        *   如果发现某只白酒基金大跌，会搜索“白酒板块最新利空”。
    4.  **人格化润色**：由 Aria 根据原始数据 and 搜索到的市场背景，写出一份带有温度的日报。

## 3. 实现路径 (Implementation Roadmap)

### 步骤 A：Panorama 逻辑增强（当前正在进行的更新）
*   完善 `src-core` 里的 `ValuationService`，确保其可以在没有 GUI 上下文的情况下独立运行。
*   确保数据库锁处理顺畅（防止 CLI 和 GUI 同时打开时产生的 SQLite 冲突）。

### 步骤 B：暴露 CLI 接口
*   在 `src-core` 或专门的 `src-cli` 中，利用 `clap` 库封装指令。
*   实现 `--json` flag，确保输出内容纯净。

### 步骤 C：OpenClaw Skill 开发
*   在 `~/.openclaw/skills/` 创建 `panorama_helper`。
*   配置 OpenClaw 访问 Panorama 数据库的权限。

## 4. 预期效果示例

> **Aria 的晨间简报 ☕**
> 
> 早安，Gallant！昨晚美股纳指收涨 1.5%，受此影响，你持有的 **纳指ETF (513050)** 表现亮眼。
> 
> 📊 **昨日资产动态：**
> *   **总市值**：¥348,036 (+¥1,205)
> *   **单日涨跌**：+0.35% (跑赢沪深300)
> 
> 🚀 **显眼包：**
> *   **NVDA**: +2.4% (AI 芯片板块持续走强)
> *   **华安德国DAX**: +1.1%
> 
> 📉 **拖后腿：**
> *   **中证白酒**: -0.8% (近期白酒消费疲软)
> 
> **Aria 的小贴士**：昨晚美联储的会议纪要比预期温和，科技股整体承压释放。如果你打算调仓，目前持有的现金比例（4.3%）处于健康状态。
