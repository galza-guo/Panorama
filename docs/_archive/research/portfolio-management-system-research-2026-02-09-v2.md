# 个人财富聚合管理系统 - 技术方案研究 v2

**日期**: 2026-02-09
**更新**: 补充Tauri桌面应用、免费API限流验证、中国券商API覆盖

---

## 一、核心问题回答

### Q1: Planto对中国（A股/券商）的覆盖究竟有多限制？

**答案：限制很大，无法自动同步A股券商**

| 市场 | Planto支持 | 方式 | 备注 |
|------|-----------|------|------|
| 香港银行/MPF | ✅ 原生 | API直连 | 最强 |
| 美股券商（盈透/富途/老虎） | ✅ 原生 | API/OAuth | 最强 |
| A股券商（华泰/中信/东财） | ❌ **不支持** | 需手动导入CSV | **核心限制** |
| 场外基金 | ⚠️ 有限 | 手动输入 | - |

**结论**: Planto是"香港视角"工具，不是True All-in-One。要覆盖A股，需要搭配其他方案。

---

### Q2: 免费API是否足够？

**答案：基本够用，但有风险和限制**

#### 免费API验证（2026年2月）

| API | 限制 | 可用性 | 评分 |
|-----|------|--------|------|
| **Yahoo Finance (yfinance)** | ~1请求/秒（隐式） | ⚠️ **脆弱** | ⭐⭐⭐ |
| **Alpha Vantage** | **25次/天** | ❌ 太限制 | ⭐ |
| **Finnhub** | 60次/分钟 | ✅ US股票 | ⭐⭐⭐ |
| **东方财富** | IP限速（约10次/分） | ✅ A股可用 | ⭐⭐⭐⭐ |
| **新浪财经** | 需Referer头 | ✅ A股/港股 | ⭐⭐⭐⭐ |
| **AKShare** | 需频繁更新 | ✅ A股最全 | ⭐⭐⭐⭐⭐ |
| **天天基金API** | 免费 | ✅ 基金净值 | ⭐⭐⭐⭐⭐ |

**关键发现**：
- Yahoo Finance在2025年把历史数据下载改成了$40/月付费墙，yfinance库需要频繁更新才能绕过
- Alpha Vantage免费额度从500次/天砍到25次/天，基本不可用
- A股数据（东方财富/新浪）可以免费获取，但需要处理反爬虫

---

### Q3: 轻量桌面/Web app方案

**答案：有完美匹配的开源方案**

---

## 二、推荐方案重新评估

### 方案A：Panorama + 自建数据层（推荐！）

**Panorama** 是完美匹配你需求的Tauri应用：

| 特性 | 详情 |
|------|------|
| **框架** | Tauri (Rust) + TypeScript |
| **数据存储** | 本地JSON/SQLite |
| **更新方式** | 打开时刷新，无后台 |
| **隐私** | 100%本地，不上传云端 |
| **平台** | macOS/Windows/Linux/iOS/Android/Docker |
| **开源** | AGPL-3.0，6,200+ Stars |
| **费用** | 免费（可选Connect订阅$3/月） |

**官网**: https://panorama.app
**GitHub**: https://github.com/galza-guo/Panorama

#### Panorama支持的资产

| 资产类型 | 支持 | 备注 |
|----------|------|------|
| 股票/ETF | ✅ | 多账户 |
| 加密货币 | ✅ | - |
| 基金 | ✅ | CSV导入 |
| 债券 | ✅ | - |
| 现金/银行 | ✅ | - |
| 保险 | ⚠️ | 需手动添加为资产 |

#### Panorama的数据获取

```
Panorama本身不自动拉取价格
需要搭配：
├── AKShare / 东方财富API → 获取A股价格
├── Yahoo Finance → 获取港股/美股价格
└── 天天基金API → 获取基金净值
```

**架构**：
```
┌─────────────────────────────────────┐
│          Panorama (本地)          │
│  ┌─────────────────────────────────┐ │
│  │ 持仓数据 (本地SQLite)           │ │
│  │ - 股票代码/数量                │ │
│  │ - 基金代码/份额                │ │
│  │ - 保险现金价值                 │ │
│  └─────────────────────────────────┘ │
│                  ↑                  │
│         手动/API更新价格            │
└─────────────────────────────────────┘
         ↑                    ↑
    ┌────┴────┐       ┌────┴────┐
    │AKShare   │       │Yahoo Fin.│
    │东方财富   │       │Finnhub   │
    └──────────┘       └──────────┘
```

---

### 方案B：Portfolio Performance（Java桌面应用）

| 特性 | 详情 |
|------|------|
| **框架** | Java/Eclipse SWT |
| **数据存储** | 本地XML |
| **更新** | 打开时从Yahoo/Akary拉取 |
| **特点** | 专业的IRR/TTWROR计算 |
| **费用** | 完全免费 |
| **平台** | macOS/Windows/Linux |

**官网**: https://www.portfolio-performance.info

**适合**: 认真的投资者，需要详细业绩归因分析

---

### 方案C：Actual Budget + Portfolio（组合）

| 组合 | 用途 |
|------|------|
| **Actual Budget** | 日常预算 + 资产净值追踪 |
| **Panorama** | 投资组合详细分析 |

**Actual Budget**:
- SQLite本地存储
- 可选端到端加密同步服务器
- 100%免费

---

## 三、中国券商API覆盖深度分析

### 核心结论（2026年）

**A股券商API现状**：

| 券商 | API支持 | 自动同步 | 备注 |
|------|---------|---------|------|
| 华泰证券 | ❌ 无 | ❌ | 不对第三方开放 |
| 中信证券 | ❌ 无 | ❌ | 不对第三方开放 |
| 东方财富 | ⚠️ 间接 | ⚠️ 可抓取 | 需反向工程API |
| 富途证券 | ✅ 有 | ✅ | FutuOpenAPI |
| 老虎证券 | ✅ 有 | ✅ | Tiger Open API |
| 雪盈证券 | ⚠️ 有限 | ⚠️ | 邮件解析 |

### 解决方案

#### 方案1：雪球/蛋卷基金组合（手动但方便）

雪球的"组合"功能可以：
- 手动添加A股持仓
- 查看实时估值
- 跟踪收益

**缺点**: 不能自动同步，需要手动维护

#### 方案2：富途/老虎API + Panorama

富途提供 **FutuOpenAPI**，可以：
- 获取实时行情
- 获取持仓
- 自动同步

**集成方式**:
```
Python脚本 (FutuOpenAPI) → 获取持仓/价格 → 导出CSV → Panorama导入
```

#### 方案3：AKShare + 自建定时任务

```
AKShare → 获取A股/基金价格
     ↓
定时脚本 (cron) → 每天打开时运行
     ↓
更新本地JSON/SQLite
     ↓
Panorama读取本地数据
```

---

## 四、完整推荐方案（按你的需求定制）

### 推荐：Panorama + AKShare定时层

#### 架构图

```
┌────────────────────────────────────────────────────────────┐
│                   Panorama (本地App)                 │
│  ┌──────────────┐    ┌──────────────┐    ┌────────┐ │
│  │ 投资组合      │    │ 保险资产    │    │ 现金   │ │
│  │ - A股        │    │ - 储蓄险    │    │ - 存款  │ │
│  │ - 港股/美股   │    │ - 年金      │    │ - 理财  │ │
│  │ - 基金       │    │ - 其他保险   │    │         │ │
│  └──────────────┘    └──────────────┘    └────────┘ │
│                         ↑                            │
│              CSV批量导入/手动更新                      │
└────────────────────────────────────────────────────────────┘
                         ↑
            ┌──────────┬──────────┴────────┬──────────┐
            │          │                 │          │
       ┌────┴────┐ ┌────┴────┐    ┌─────┴────┐ ┌────┴────┐
       │ AKShare │ │ Yahoo   │    │ 天天基金 │ │ Finnhub │
       │ 东方财富│ │ Finance │    │   API    │ │         │
       └─────────┘ └─────────┘    └──────────┘ └─────────┘
```

#### 实施步骤

##### 步骤1：安装Panorama

```bash
# macOS
brew install --cask panorama

# 或下载DMG: https://panorama.app/download
```

##### 步骤2：创建持仓CSV模板

```csv
symbol,name,quantity,account,type,currency,buy_date,buy_price
600519,贵州茅台,100,华泰证券-A股,stock,CNY,2023-01-15,1800
00700,腾讯控股,200,富途证券-港股,stock,HKD,2023-03-20,350
VTI,Vanguard Total Stock,50,盈透证券-美股,etf,USD,2023-06-01,220
161039,易方达中小盘,10000,天天基金,fund,CNY,2022-12-01,1.52
```

##### 步骤3：设置价格自动更新（可选）

创建 `update_prices.py`:

```python
#!/usr/bin/env python3
import akshare as ak
import json
from datetime import datetime

# A股持仓
a_stock_holdings = {
    "600519": {"name": "贵州茅台", "qty": 100},
    "000001": {"name": "平安银行", "qty": 1000},
}

# 获取实时价格
def get_a_stock_price(code):
    df = ak.stock_zh_a_spot_em()
    price = df[df['代码'] == code]['最新价'].values[0]
    return price

# 生成Panorama格式
output = []
for code, info in a_stock_holdings.items():
    price = get_a_stock_price(code)
    output.append({
        "symbol": code,
        "name": info["name"],
        "quantity": info["qty"],
        "price": price,
        "value": price * info["qty"],
        "updated": datetime.now().isoformat()
    })

# 保存
with open("prices.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Updated {len(output)} prices")
```

##### 步骤4：保险和MPF手动追踪

由于这些资产没有免费API，建议：

```
├── 保险现金价值
│   └── 每年保单周年日手动更新到Panorama
│
└── MPF
    └── 每季度登录eMPF app查看截图记录
```

---

## 五、各方案对比（更新版）

| 维度 | Panorama | Planto | Sharesight | 自建方案 |
|------|------------|--------|------------|----------|
| **平台** | Tauri桌面 | SaaS | SaaS/Web | 定制 |
| **A股支持** | CSV导入 | ❌ | CSV导入 | API自动 |
| **港股/美股** | CSV导入 | ✅ API | ✅ API | API自动 |
| **MPF** | 手动 | ✅ | 手动 | 手动 |
| **保险** | 手动 | 有限 | ❌ | 手动 |
| **数据存储** | 本地 | 云端 | 云端 | 本地 |
| **隐私** | ✅ 100% | ⚠️ 云端 | ⚠️ 云端 | ✅ 100% |
| **费用** | 免费/$3 | $99/年 | $139/年 | 免费 |
| **维护** | 低 | 低 | 低 | 中（需更新API） |
| **适合** | 轻量+隐私 | 港股为主 | 专业分析 | 全控制 |

---

## 六、最终建议

### 如果你追求"轻量+隐私+全覆盖"

**推荐方案: Panorama + 手动维护**

1. **投资组合** → Panorama (CSV导入/手动更新)
2. **A股价格** → AKShare脚本 (可选自动)
3. **港股/美股** → Yahoo Finance (可选自动)
4. **基金净值** → 天天基金API
5. **保险/MPF** → 手动截图记录

**时间成本**: 初始设置2-4小时，后续每月15分钟维护

---

### 如果你追求"全自动+少维护"

**推荐方案: Planto (香港) + Sharesight (A股)**

1. **香港资产** → Planto (自动同步)
2. **A股/基金** → Sharesight (CSV导入/邮件解析)
3. **美国资产** → Planto或Sharesight

**时间成本**: 初始设置1小时，后续基本免维护

---

### 如果你追求"完全自建"

**推荐方案: Ghostfolio自托管 + AKShare**

1. **部署**: Docker run ghostfolio/ghostfolio
2. **数据层**: PostgreSQL
3. **价格获取**: AKShare + Yahoo Finance定时任务
4. **前端**: Ghostfolio Web UI

**时间成本**: 初始设置4-8小时，后续每周30分钟维护

---

## 七、立即行动清单

### 今天（5分钟）

- [ ] 下载Panorama试用版: https://panorama.app/download
- [ ] 浏览Features页面了解功能

### 本周（2小时）

- [ ] 整理所有持仓清单（股票/基金/保险/MPF）
- [ ] 测试CSV导入到Panorama
- [ ] 尝试AKShare脚本获取A股价格

### 决策点

| 问题 | 你的选择 |
|------|----------|
| 愿意折腾技术吗？ | 是 → 自建/Panorama |
| 还是直接用现成工具？ | 否 → Planto + Sharesight |
| 完全隐私+本地数据？ | 是 → Panorama |
| 需要专业业绩分析？ | 是 → Portfolio Performance |

---

## 八、关键链接汇总

### 开源工具

| 工具 | 链接 | Stars |
|------|------|-------|
| Panorama | https://panorama.app | 6,200+ |
| Ghostfolio | https://ghostfolio.app | 4,100+ |
| Portfolio Performance | https://www.portfolio-performance.info | - |
| AKShare | https://akshare.xyz | - |
| Actual Budget | https://actualbudget.org | - |

### API文档

| API | 链接 |
|-----|------|
| 东方财富 | https://push2.eastmoney.com/... |
| 新浪财经 | https://hq.sinajs.cn |
| Yahoo Finance | https://query1.finance.yahoo.com |
| Finnhub | https://finnhub.io |

---

## 九、附录：中国券商数据获取方式详表

| 数据类型 | 免费来源 | 付费来源 | 可靠性 |
|---------|---------|---------|--------|
| A股实时行情 | 东方财富/新浪/AKShare | 同花顺iFinD | ⭐⭐⭐ |
| A股历史K线 | 东方财富/新浪 | Wind/彭博 | ⭐⭐⭐ |
| 港股实时行情 | Yahoo/新浪 | 同花顺iFinD | ⭐⭐⭐ |
| 美股实时行情 | Finnhub/yfinance | 彭博/路透 | ⭐⭐⭐ |
| 基金净值 | 天天基金 | Wind/彭博 | ⭐⭐⭐⭐ |
| 保险现金价值 | 各保险公司APP | - | ⭐⭐ |
| MPF净值 | eMPF官方app | - | ⭐⭐ |

---

**下一步**: 告诉我你的选择倾向（Panorama/Planto/自建），我来帮你制定具体实施细节。
