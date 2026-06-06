# Cash Flow and Net Worth Attribution

实现一个资金流水与净值归因分析功能，让用户可以清晰地看到在任意选定时间段内，净值变化主要由哪些因素驱动：

- 外部资金流入
- 外部资金流出
- 资产估值变化
- 汇率及剩余影响

V1 目标是做一个可闭环、易理解的解释账本，不追求机构级多因子归因精度。

## User Review Required

> [!IMPORTANT]
> **归因数学模型确认**
> 因为资产本身不仅有价格波动，还有汇率波动，并且期间还会有资金进出，要精确拆分“估值变化”和“汇率变化”在数学上有几种不同做法。
> V1 采用一个简易闭环模型：先针对单个账户计算，再把各账户结果加总。
>
> 1. **期初净值 (Start NW Base)** = 期初账户资产(Local) × 期初账户到 Base 的汇率
> 2. **期末净值 (End NW Base)** = 期末账户资产(Local) × 期末账户到 Base 的汇率
> 3. **期间净流入 (Net Flow Base)** = 期间外部 Deposit - Withdrawal，按发生日汇率折算到 Base Currency
> 4. **期间净流入 (Net Flow Local)** = 同一批外部资金流，折算到账户币种，用于估值变化计算
> 5. **资产估值变动 (Valuation Change Base)** = (期末账户资产(Local) - 期初账户资产(Local) - Net Flow Local) × 期初汇率
> 6. **汇率及剩余影响 (FX / Residual Change Base)** = 期末净值 - 期初净值 - Net Flow Base - Valuation Change Base
> 
> 这个做法可以保证 `期初 + 净流入 + 估值变化 + 汇率及剩余影响 = 期末`，即 100% 闭环。
>
> 注意：V1 的 `FX / Residual Change` 不是纯粹的汇率收益。它还会包含“汇率变化 × 期间资产/现金变化”这类交叉项，以及少量四舍五入残差。UI 文案应避免把它说成严格的纯汇率收益。

## Open Questions

> [!WARNING]
> 1. **功能范围**：V1 是否只解释投资组合净值，还是解释包含另类资产、负债后的完整 Net Worth？建议 V1 先跟现有 Dashboard 投资组合口径一致，完整 Net Worth 作为后续版本。
> 2. **UI 放置位置**：建议 V1 放在 Dashboard 净值曲线下方，作为同一日期区间的一个解释模块；不先做独立 Reports 页面。

## Proposed Changes

### Date and Scope Rules

- 用户传入 `start_date` 和 `end_date` 作为请求区间。
- 估值端点使用请求区间内第一条和最后一条可用的 `daily_account_valuation`，并在响应中返回实际使用的 `actual_start_date` 和 `actual_end_date`。
- 资金流日期区间使用 `(actual_start_date, actual_end_date]`：不包含实际期初当天，包含实际期末当天。
- 组合视角下，账户之间的内部转账不计入外部资金流。
- 账户视角下，转入/转出可以视为账户边界外部资金流；V1 默认实现组合视角。
- 如果某个账户在请求区间内少于两个估值点，先从计算中排除该账户，并在响应中返回 warning。
- 如果汇率缺失导致资金流无法折算，返回 warning，并把该笔 flow 排除在归因计算外；不要静默算作 0。

### 后端核心逻辑 (`crates/core`)

#### [NEW] `crates/core/src/portfolio/attribution/mod.rs`
新增 `attribution` 模块，暴露服务与模型。

#### [NEW] `crates/core/src/portfolio/attribution/model.rs`
定义数据结构，例如：
```rust
pub struct NetWorthAttribution {
    pub requested_start_date: NaiveDate,
    pub requested_end_date: NaiveDate,
    pub actual_start_date: NaiveDate,
    pub actual_end_date: NaiveDate,
    pub base_currency: String,
    pub start_value_base: Decimal,
    pub end_value_base: Decimal,
    pub deposits_base: Decimal,
    pub withdrawals_base: Decimal,
    pub valuation_change_base: Decimal,
    pub fx_residual_change_base: Decimal,
    pub total_change_base: Decimal,
    pub warnings: Vec<AttributionWarning>,
}

pub struct AttributionWarning {
    pub code: String,
    pub message: String,
    pub account_id: Option<String>,
}
```

#### [NEW] `crates/core/src/portfolio/attribution/service.rs`
实现计算逻辑：
1. 按账户获取请求区间内的 `daily_account_valuation`，使用第一条和最后一条作为实际期初/期末点。
2. 根据 `flow_classifier::is_external_flow_for_scope(activity, PerformanceScope::Portfolio)` 取出期间内的外部资金流。
3. 对每笔外部资金流同时计算：
   - Base Currency 金额，用于瀑布图闭环。
   - Account Currency 金额，用于估值变化计算。
4. 对每个账户应用上述数学公式，再加总到账户组合级响应。
5. 最后校验闭环：`start_value_base + deposits_base - withdrawals_base + valuation_change_base + fx_residual_change_base == end_value_base`，允许 Decimal 舍入误差。

#### Dependencies

- 使用现有 `ValuationServiceTrait` 获取历史估值。
- 使用现有 `ActivityRepositoryTrait::search_activities` 或等价 service 方法获取区间内 activities。
- 使用现有 FX service 做日期汇率折算。
- 复用 `portfolio::performance::flow_classifier`，不要重新写一套资金流分类规则。

### API 层

#### [NEW] `apps/server/src/api/portfolio_attribution.rs`
创建 Web HTTP 接口，例如：

`GET /api/v1/portfolio/attribution?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

响应中的日期字段必须区分请求区间和实际估值区间，避免周末、节假日或缺失估值点造成 UI 误解。

#### [NEW] `apps/tauri/src/commands/portfolio_attribution.rs`
创建 Tauri IPC 命令 `get_portfolio_attribution`，并在 `mod.rs` 和 `lib.rs` 中注册。

### 前端 (`apps/frontend`)

#### [MODIFY] `apps/frontend/src/adapters/shared/portfolio.ts`
新增 `getPortfolioAttribution` 包装函数。

#### [MODIFY] `apps/frontend/src/adapters/web/core.ts`
新增 `get_portfolio_attribution` 到 `COMMANDS`，并添加 query 参数映射。

#### [MODIFY] `apps/frontend/src/lib/types.ts`
新增 `NetWorthAttribution` 和 `AttributionWarning` 前端类型。

#### [NEW] `apps/frontend/src/pages/dashboard/attribution-widget.tsx`
实现 UI 组件，展示：

- 期初净值
- 存入
- 取出
- 资产涨跌
- 汇率及剩余影响
- 期末净值

可视化使用现有 Recharts，不新增图表依赖。V1 优先做轻量瀑布图，下面配一个明细列表；移动端可退化为纵向列表。

#### [MODIFY] `apps/frontend/src/pages/dashboard/dashboard-content.tsx`
将 attribution widget 挂载到净值曲线和日期选择器下方，复用当前 Dashboard 的日期区间。

## Verification Plan

### Automated Tests
- 在 `crates/core` 编写单账户单币种测试：期初 1000 USD，期间存入 500 USD，期末 1600 USD，汇率恒定。断言 valuation change = 100 USD，FX/residual = 0。
- 编写单账户跨币种测试：期初 1000 USD，期初汇率 7.0，期间存入 500 USD（发生日汇率 7.1），期末 1600 USD，期末汇率 7.2。断言闭环等式成立。
- 编写内部转账测试：两个账户之间的 transfer 不改变组合级 deposits/withdrawals。
- 编写缺失估值或缺失汇率测试：返回 warning，且不会静默把缺失数据当成 0。
- 前端添加一个组件级测试，验证瀑布图/明细列表展示值能闭环。

### Manual Verification
- 启动 `pnpm tauri dev`。
- 在前端任意选定时间段（如过去30天），检查这四个维度的加和是否严格等于总资产的变化值。
- 确认没有 Double Counting（双重计算）的问题，特别是涉及到不同币种账户之间的转账。
- 在有多币种账户的数据上确认 `FX / Residual` 文案不会误导成“纯汇率收益”。
