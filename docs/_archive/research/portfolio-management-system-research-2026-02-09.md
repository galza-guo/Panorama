# 个人财富聚合管理系统 - 技术方案研究

**日期**: 2026-02-09
**研究目标**: 建立一个系统，聚合所有投资持仓（A股、场外基金、债券基金、保险、MPF、港股、美股），实现一键查看最新价值

---

## 一、需求确认

### 你的持仓覆盖

| 类别 | 平台 | 账户数 |
|------|------|--------|
| A股股票 | 华泰/中信等 | 2人各自账户 |
| 场外基金 | 天天/蚂蚁等 | 多只 |
| 债券基金 | 银行/券商 | 多只 |
| 储蓄险/其他保险 | 内地/香港 | 多份 |
| 年金产品 | 保险公司 | 多份 |
| MPF | 香港强积金 | 多个账户 |
| 港股 | 盈透/富途/老虎 | 多个 |
| 美股 | 盈透/富途/老虎 | 多个 |

### 核心需求

1. **自动获取价格/净值** - API优先，手动为辅
2. **多平台聚合** - 所有账户一览
3. **实时更新** - 每日自动刷新
4. **零维护** - 一次输入，长期使用

---

## 二、现有解决方案分析

### 方案A：SaaS平台（推荐程度排序）

| 工具 | 市场覆盖 | MPF支持 | 保险支持 | 费用 | 推荐度 |
|------|---------|---------|---------|------|--------|
| **Planto** | HK/US/部分CN | ✅ 原生 | 手动 | Free/Pro | ⭐⭐⭐⭐⭐ |
| **Sharesight** | US/HK/CN全球40+交易所 | 手动 | ❌ | Free/Paid | ⭐⭐⭐⭐ |
| **Kubera** | 全球 | ✅ | ✅ | Paid Only | ⭐⭐⭐⭐ |
| **雪球** | CN/HK/US | ❌ | ❌ | Free | ⭐⭐⭐ |
| **Morningstar** | 全球 | ❌ | ❌ | Free/Premium | ⭐⭐⭐ |

#### 最佳推荐：Planto + Sharesight 组合

**Planto (香港)**
- ✅ 聚合60+香港金融机构（汇丰、渣打等）
- ✅ MPF账户原生支持
- ✅ 支持美股券商（盈透、富途等）
- ✅ 支持通过Open Banking链接
- ❌ A股券商聚合较弱

**Sharesight (全球)**
- ✅ 支持40+交易所（A股、港股、美股）
- ✅ 自动处理股息、拆分、货币
- ✅ 支持API连接券商
- ❌ MPF不支持
- ❌ 保险不支持

**组合策略**：
```
Planto → MPF + 港股 + 美股 + 银行账户
Sharesight → A股 + 场外基金详细分析
手动/其他 → 保险现金价值 + 年金
```

---

### 方案B：DIY自建方案（技术向）

#### 1. 免费数据API汇总

##### A股
| 数据源 | 接口 | 限制 | 推荐度 |
|--------|------|------|--------|
| **东方财富** | `push2.eastmoney.com/api/qt/...` | IP限速 | ⭐⭐⭐⭐⭐ |
| **新浪财经** | `hq.sinajs.cn/list={code}` | 需Referer头 | ⭐⭐⭐⭐ |
| **AKShare** | Python库 | 免费开源 | ⭐⭐⭐⭐⭐ |

##### 港股
| 数据源 | 接口 | 限制 | 推荐度 |
|--------|------|------|--------|
| **新浪财经HK** | `hq.sinajs.cn/list=hk{code}` | 需Referer | ⭐⭐⭐⭐ |
| **Yahoo Finance** | `query1.finance.yahoo.com/v8/...` | 2000请求/小时 | ⭐⭐⭐⭐ |
| **AllTick API** | alltick.co | 免费层级 | ⭐⭐⭐ |

##### 美股
| 数据源 | 接口 | 限制 | 推荐度 |
|--------|------|------|--------|
| **Yahoo Finance** | 同上 | 免费 | ⭐⭐⭐⭐⭐ |
| **Finnhub** | 60请求/分钟 | 需API Key | ⭐⭐⭐ |
| **Alpha Vantage** | 25请求/天 | 需API Key | ⭐⭐ |

##### 场外基金（净值）
| 数据源 | 接口 | 推荐度 |
|--------|------|--------|
| **天天基金** | `fundgz.1234567.com.cn/js/{code}.js` | ⭐⭐⭐⭐⭐ |
| **东方财富基金** | `fund.eastmoney.com/...` | ⭐⭐⭐⭐ |

##### MPF
| 数据源 | 方式 | 推荐度 |
|--------|------|--------|
| **eMPF官方平台** | 手动查看/截屏 | ⭐⭐⭐⭐ |
| **MPFA数据门户** | data.gov.hk | ⭐⭐⭐ |

#### 2. DIY技术栈推荐

| 层级 | 工具 | 说明 |
|------|------|------|
| **数据聚合** | **OpenBB Platform** | Python开源，聚合Yahoo/Akary/A股等 |
| **数据库** | **Ghostfolio** | 自托管财富管理，PostgreSQL |
| **自动化** | **AppleScript + Cron** | macOS定时抓取 |
| **可视化** | **Grafana** | 实时仪表盘 |
| **备选** | **Google Sheets + Apps Script** | 零服务器方案 |

#### 3. 推荐架构（从简单到复杂）

##### 方案B1：Google Sheets（最简单）
```
1. 创建Google Sheet
2. Apps Script获取API数据
3. 定时触发（Google Apps Script定时器）
4. 手动输入：保险现金价值、MPF
```

**API获取脚本示例**：
```javascript
// Apps Script for Yahoo Finance
function getStockPrice(ticker) {
  var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker;
  var response = UrlFetchApp.fetch(url);
  var data = JSON.parse(response.getContentText());
  return data.chart.result[0].meta.regularMarketPrice;
}
```

##### 方案B2：Ghostfolio（自托管，推荐）
```
1. Docker部署Ghostfolio
2. 配置数据源（Yahoo Finance, Alpha Vantage）
3. 手动添加A股、基金、保险
4. 定时刷新价格
```

**Ghostfolio特点**：
- ✅ 开源自托管
- ✅ 支持多资产类型
- ✅ 美观仪表盘
- ✅ 导出PDF报告
- ❌ 需要服务器/Docker

##### 方案B3：完整自建（高级玩家）
```
数据层: OpenBB Platform (Python)
    ↓
存储层: PostgreSQL + InfluxDB
    ↓
自动化: AppleScript + cron (macOS定时任务)
    ↓
展示层: Grafana仪表盘
```

---

### 方案C：保险专项管理

| 工具 | 功能 | 推荐度 |
|------|------|--------|
| **金事通app** | 中国保险保单查询 | ⭐⭐⭐⭐⭐ |
| **保单管家app** | AI解析保单 | ⭐⭐⭐⭐ |
| **各保险公司app** | AIA+/AXA Emma/平安金管家 | ⭐⭐⭐⭐⭐ |
| **PortfoPlus** | 香港保险专业管理 | ⭐⭐⭐⭐ |

**保险现金价值追踪建议**：
- 每年保单周年日手动更新到主系统
- 或在各保险公司app中截图保存历史

---

## 三、推荐方案（按你的需求匹配）

### 如果你追求**简单、快速使用**：

```
推荐：Planto + Google Sheets

Planto（手机App）
├── ✅ 链接：香港银行、MPF、美股券商
├── ✅ 自动更新价格
├── ❌ A股需手动
└── ❌ 保险需手动

Google Sheets（电脑）
├── ✅ A股/场外基金API自动获取
├── ✅ 保险/年金手动记录（季度更新）
├── ✅ MPF手动记录（年度）
└── ✅ 免费、灵活
```

### 如果你追求**完整控制、自托管**：

```
推荐：Ghostfolio + OpenBB + 保险单独管理

Ghostfolio（自托管Docker）
├── ✅ 聚合所有投资（A股/港股/美股/基金）
├── ✅ 自动刷新价格（Yahoo/Akary）
├── ✅ 多用户支持（你+夫人）
├── ✅ 仪表盘美观
└── ❌ 需要服务器/VPS

保险/MPF → Google Sheets手动补充
```

---

## 四、具体实施步骤

### 第一阶段：基础数据整理（1周）

1. **盘点所有持仓**
   - [ ] A股：列出所有股票代码和持仓数量
   - [ ] 场外基金：列出所有基金代码
   - [ ] 债券基金：同上
   - [ ] 保险：保单号、保险公司、现金价值
   - [ ] MPF：所有账户的基金配置
   - [ ] 港股/美股：持仓代码和数量

2. **收集账户信息**
   - [ ] 券商APP截图（当前持仓页面）
   - [ ] 基金账户截图
   - [ ] MPF账户信息

### 第二阶段：选择方案并实施（2-4周）

#### 选择Planto的用户：
1. 下载Planto app（香港）
2. 验证链接：香港银行账户
3. 链接MPF账户（通过trustee）
4. 链接美股券商（盈透/富途）
5. 手动添加：A股、基金、保险

#### 选择Google Sheets的用户：
1. 创建Google Sheet模板
2. 编写Apps Script获取：
   - A股价格（东方财富API）
   - 基金净值（天天基金API）
   - 港股/美股价格（Yahoo Finance）
3. 设置定时触发
4. 手动输入账户基础信息

#### 选择Ghostfolio的用户：
1. 准备VPS或本地Docker环境
2. 部署Ghostfolio
3. 配置数据源
4. 导入初始持仓
5. 设置自动刷新

### 第三阶段：优化和自动化（持续）

1. **定期更新**：保险现金价值（每年）
2. **MPF更新**：每季度
3. **持仓调整**：买卖时同步更新系统

---

## 五、各方案成本对比

| 方案 | 一次性成本 | 持续成本 | 技术门槛 |
|------|-----------|---------|---------|
| Planto Premium | $0 | $99/年 | 低 |
| Sharesight | $0 | $139/年 | 低 |
| Ghostfolio自托管 | $0 | 服务器约$60/年 | 中 |
| Google Sheets | $0 | $0 | 低 |
| 完整DIY | $0 | 服务器+VPS | 高 |

---

## 六、关键数据源速查表

```
┌─────────────────────────────────────────────────────────────┐
│                    免费API速查表                              │
├─────────────┬────────────────────────────────────────────────┤
│ A股实时     │ EastMoney: push2.eastmoney.com/api/qt/...   │
│             │ Sina: hq.sinajs.cn/list=sh600519            │
├─────────────┼────────────────────────────────────────────────┤
│ 港股实时    │ Yahoo: query1.finance.yahoo.com/v8/...    │
│             │ Sina HK: hq.sinajs.cn/list=hk00700          │
├─────────────┼────────────────────────────────────────────────┤
│ 美股实时    │ Yahoo Finance (推荐)                          │
│             │ Finnhub: 60req/min (需Key)                   │
├─────────────┼────────────────────────────────────────────────┤
│ 基金净值    │ 天天基金: fundgz.1234567.com.cn/js/{code}.js │
├─────────────┼────────────────────────────────────────────────┤
│ MPF净值     │ eMPF官方app / data.gov.hk                   │
├─────────────┼────────────────────────────────────────────────┤
│ Python库    │ AkShare (A股/基金/宏观全覆盖)              │
│             │ OpenBB (全球市场，研究用)                     │
└─────────────┴────────────────────────────────────────────────┘
```

---

## 七、行动建议

### 立即可以做的事（今天）

1. **下载Planto app** → 浏览香港金融机构链接功能
2. **盘点持仓清单** → 整理到Google Sheet

### 本周内

1. **尝试Planto链接** → 香港银行账户
2. **测试Google Sheets API** → 获取一只A股价格

### 决策点

| 问题 | 选Planto | 选DIY |
|------|---------|-------|
| 你愿意花时间折腾技术吗？ | No | Yes |
| 需要完美控制数据吗？ | No | Yes |
| 能接受年费吗？ | Yes | No |
| 想深入了解自己的持仓吗？ | 一般 | 非常想 |

---

## 八、相关资源链接

### SaaS平台
- Planto: https://www.planto.hk
- Sharesight: https://www.sharesight.com
- Kubera: https://www.kubera.com

### 开源工具
- Ghostfolio: https://ghostfolio.app
- OpenBB: https://openbb.co
- Firefly III: https://firefly-iii.org

### 数据源
- AKShare文档: https://akshare.xyz
- Yahoo Finance: https://finance.yahoo.com
- 东方财富API: 需抓包获取

---

**下一步**: 告诉我你的选择倾向，我来帮你制定具体实施步骤。

1. **Planto + Sheets**（简单快速）
2. **Ghostfolio自托管**（完整控制）
3. **其他方案**
