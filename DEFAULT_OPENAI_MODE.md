# 默认使用OpenAI API模式

## 🎯 变更说明

应用现在默认使用 **OpenAI API模式** 而不是Tauri模式。

## ✅ 实现的变更

### 1. ServiceFactory默认模式
- 将 `currentMode` 默认值从 `'tauri'` 改为 `'openai'`
- 更新构造函数逻辑，确保首次启动时自动设置为OpenAI模式

### 2. localStorage处理
- 如果localStorage中没有保存的模式，自动设置为 `'openai'`
- 保持用户手动切换的设置不变

### 3. 文档更新
- 更新README文档，明确标注OpenAI模式为默认模式
- 调整使用示例的顺序，优先展示OpenAI模式

## 🔧 技术实现

### ServiceFactory.ts 变更
```typescript
// 默认模式改为 openai
private currentMode: ServiceMode = 'openai';

// 构造函数中的逻辑
private constructor() {
  const savedMode = localStorage.getItem(SERVICE_MODE_KEY) as ServiceMode;
  if (savedMode && (savedMode === 'tauri' || savedMode === 'openai')) {
    this.currentMode = savedMode;
  } else {
    // 默认设置为 openai 并保存
    this.currentMode = 'openai';
    localStorage.setItem(SERVICE_MODE_KEY, 'openai');
  }
}
```

## 🚀 用户体验

### 首次启动
- 新用户默认使用OpenAI API模式
- 享受标准HTTP API的兼容性
- 可以使用任何支持OpenAI API的客户端

### 现有用户
- 如果之前手动设置过模式，保持原有设置
- 如果没有设置过，自动切换到OpenAI模式
- 可以随时在设置中切换回Tauri模式

## 📊 模式对比

| 特性 | OpenAI模式 (默认) | Tauri模式 |
|------|------------------|-----------|
| API兼容性 | ✅ 标准OpenAI API | ❌ 仅Tauri |
| 第三方客户端 | ✅ 支持 | ❌ 不支持 |
| 工具功能 | ❌ 不支持 | ✅ 完整支持 |
| 性能 | 🔄 HTTP开销 | ⚡ 直接调用 |
| 开发体验 | 🌐 Web标准 | 🖥️ 原生集成 |

## 🎉 优势

1. **标准化**: 使用业界标准的OpenAI API格式
2. **兼容性**: 支持现有的OpenAI生态系统
3. **灵活性**: 可以使用任何OpenAI兼容的客户端
4. **易用性**: 更符合开发者的预期

## 🔄 回退方案

如果需要回到Tauri模式作为默认：
1. 在系统设置中手动切换到Tauri模式
2. 或者修改 `ServiceFactory.ts` 中的默认值

这个变更确保了应用更好地适应现代AI应用开发的标准，同时保持了完整的向后兼容性。
