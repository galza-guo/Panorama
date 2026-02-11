# 插件入门

5分钟构建您的第一个 Panorama 插件。

## 1. 设置项目

创建一个新文件夹并初始化 NPM 项目。\`\`\`bash mkdir my-first-addon cd
my-first-addon npm init -y \`\`\`

## 2. 安装开发工具

安装 Panorama 插件开发包。\`\`\`bash npm install -D @panorama/addon-dev-tools
\`\`\`

## 3. 创建 Manifest

在根目录创建 `manifest.json`：\`\`\`json { "id": "com.example.hello", "name":
"Hello World", "version": "1.0.0", "permissions": [] } \`\`\`

## 4. 编写代码

创建 `src/index.tsx`：\`\`\`tsx import React from 'react'; import { render }
from '@panorama/addon-sdk';

const App = () => <h1>Hello from Panorama!</h1>;

render(<App />); \`\`\`

## 5. 构建与测试

运行构建命令，并在 Panorama 设置中加载生成的文件夹。
