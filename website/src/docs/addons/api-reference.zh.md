# 开发插件

想为 Panorama 构建插件？使用标准 Web 技术（TypeScript, React）非常容易。

## 入门

1.  **脚手架**：使用插件生成器（即将推出）或从模板开始。
2.  **清单**：每个插件都需要一个 `manifest.json` 来描述其权限和入口点。
3.  **开发**：使用 React 构建您的 UI。
4.  **测试**：通过设置中的“开发者模式”在 Panorama 中本地加载您的插件。

## API 参考

Panorama 向插件公开了全面的 API。

- `panorama.getAccounts()`：列出所有账户。
- `panorama.getActivities(filter)`：获取交易。
- `panorama.getMarketData(ticker)`：获取价格历史。
- `panorama.secrets`：安全存储 API 密钥。

有关完整的 API 文档，请参阅 [GitHub 仓库](https://github.com/galza-guo/Panorama)
中的类型定义。
