# Panorama Project Overview

> 个人财富聚合管理系统 - 基于Panorama的Fork

## 关于Panorama

Panorama是一个基于Panorama fork的个人财富管理系统，目标是实现真正的"All-in-One"资产管理。

## 涵盖资产类型

- ✅ A股/港股/美股
- ✅ 场外基金/债券基金
- ✅ 储蓄险/年金/其他保险
- ✅ MPF（香港强积金）
- ✅ 多账户支持（你+夫人）

## 核心理念

- 🔒 **隐私第一** - 所有数据本地存储，不上传云端
- 🌐 **全覆盖** - 打通所有资产类型
- ⚡ **简便** - 开箱即用，API自动配置
- 🔧 **可扩展** - 开源，可自定义

## 项目状态

**当前阶段**: 需求分析完成，实施规划中

**下一步**: Phase 1 - 补齐中国市场数据源（A股 + 场外基金净值）

## 技术栈

- **UI**: React + TypeScript
- **框架**: Tauri (Rust)
- **数据存储**: SQLite
- **开源协议**: AGPL-3.0

## 文档

| 文档 | 说明 |
|------|------|
| [Audit](PANORAMA_AUDIT_2026-02-09.md) | 现状审计：Panorama底座已有Market Data / FX / Secrets / Settings |
| [Plan](../PLAN.md) | 实施计划：新增CN providers + 保险/MPF UI |
| [Market Data Spec](../PANORAMA_MARKET_DATA_SPEC.md) | Phase 1 唯一标准：symbol 规范 + providers + mapping + 缓存/限流 |
| [研究笔记](research/) | 前期研究笔记 |

## 致谢

- [Panorama](https://github.com/galza-guo/Panorama) - 原始项目
- [AKShare](https://akshare.xyz/) - A股数据
- [Yahoo Finance](https://finance.yahoo.com/) - 港股/美股数据

## 许可证

AGPL-3.0
