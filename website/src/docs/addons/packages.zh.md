# 包管理

Panorama 插件使用标准的 NPM 包结构。

## 结构

- `package.json`: 定义依赖项和元数据。
- `manifest.json`: Panorama 特有的清单文件。
- `dist/`: 编译后的输出文件。

## 依赖关系

插件可以包含任何兼容浏览器的 NPM 包。但是，为了保持轻量级，建议使用 Panorama 提供的共享库（如 React,
UI 组件）。

## 发布

（计划功能）插件将被打包为 `.pha`（Panorama Host
Addon）文件，这是一个包含签名的 ZIP 归档。
