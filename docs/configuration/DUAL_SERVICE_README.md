# 双服务模式重构说明

## 概述

本次重构实现了两种服务模式的支持：
1. **OpenAI模式** - 使用标准的OpenAI API兼容接口 (默认)
2. **Tauri模式** - 使用原有的Tauri命令方式

## 🎯 实现的功能

### 后端 (Rust)
- ✅ 保持现有Tauri Commands正常工作
- ✅ 新增actix-web服务，提供OpenAI兼容API
- ✅ 自动启动Web服务在`localhost:8080`
- ✅ 支持流式和非流式响应
- ✅ 支持图片消息处理

### 前端 (TypeScript/React)
- ✅ 抽象服务接口，支持两种实现
- ✅ ServiceFactory管理服务切换
- ✅ 系统设置中添加服务模式切换开关
- ✅ 保持向后兼容性

## 🔧 技术架构

### 服务抽象层
```
ServiceFactory
├── ChatService (聊天功能)
│   ├── TauriChatService (Tauri实现)
│   └── OpenAIService (OpenAI API实现)
├── ToolService (工具功能，仅Tauri)
└── UtilityService (工具功能，仅Tauri)
```

### API端点 (OpenAI兼容)
- `POST /v1/chat/completions` - 聊天完成接口
- `GET /v1/models` - 获取可用模型

## 🚀 使用方式

### 方式1：OpenAI API模式 (默认)
```javascript
// 使用ServiceFactory (自动使用OpenAI模式)
import { serviceFactory } from '../services/ServiceFactory';

await serviceFactory.executePrompt(messages, model, onChunk);
await serviceFactory.getModels();
```

### 方式2：直接使用OpenAI库
```javascript
// 使用标准OpenAI库
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'dummy-key' // 不需要真实key
});

const response = await client.chat.completions.create({
  model: 'gpt-4.1',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
});
```

## ⚙️ 切换服务模式

**默认模式**: OpenAI API模式

### 切换步骤
1. 打开系统设置 (Settings)
2. 找到 "Service Mode" 开关
3. 切换到 OpenAI 或 Tauri 模式
4. 设置会自动保存到localStorage

### 模式说明
- **OpenAI模式** (默认): 使用HTTP API调用，兼容标准OpenAI客户端
- **Tauri模式**: 使用原生Tauri命令，更直接的系统集成

## 🔄 数据流转

### OpenAI模式 (默认)
```
前端 → ServiceFactory → OpenAIService → HTTP请求 → actix-web → CopilotClient → GitHub Copilot API
```

### Tauri模式
```
前端 → ServiceFactory → TauriChatService → Tauri Command → CopilotClient → GitHub Copilot API
```

## 📝 注意事项

1. **工具功能** - 目前仅在Tauri模式下可用，因为它们不是标准OpenAI API的一部分
2. **自动启动** - Web服务在应用启动时自动启动，无需手动控制
3. **向后兼容** - 现有代码无需修改，会自动使用ServiceFactory
4. **错误处理** - 两种模式都有完整的错误处理和日志记录

## 🛠️ 开发说明

### 添加新的服务功能
1. 在相应的Service接口中添加方法
2. 在TauriService中实现Tauri版本
3. 如果适用，在OpenAIService中实现OpenAI版本
4. 在ServiceFactory中添加便捷方法

### 测试
- Tauri模式：使用现有的测试方法
- OpenAI模式：可以使用任何支持OpenAI API的客户端测试

## 🎉 优势

1. **灵活性** - 支持两种不同的使用方式
2. **兼容性** - 与现有OpenAI生态系统兼容
3. **渐进式** - 可以逐步迁移到新模式
4. **可扩展** - 易于添加更多服务实现
