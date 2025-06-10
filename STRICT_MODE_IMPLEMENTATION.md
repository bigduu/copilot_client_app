# 严格模式验证逻辑实现文档

## 概述

本文档描述了在前端实现的 `strict_tools_mode` 验证逻辑，确保用户在严格模式下只能发送以 `/` 开头的工具调用格式消息。

## 实现内容

### 1. 类型定义 (`src/types/toolCategory.ts`)

- **ToolCategoryInfo 接口**: 匹配后端 ToolCategory 结构，包含 `strict_tools_mode` 字段
- **MessageValidationResult 接口**: 定义验证结果结构
- **ToolCategoryService 类**: 提供验证逻辑和工具方法

### 2. React Hook (`src/hooks/useToolCategoryValidation.ts`)

提供以下功能：
- `validateMessage()`: 验证消息是否符合严格模式要求
- `isStrictMode()`: 检查当前是否为严格模式
- `getStrictModePlaceholder()`: 获取严格模式的输入提示
- `getStrictModeErrorMessage()`: 获取严格模式的错误提示

### 3. 后端 API (`src-tauri/src/command/tools.rs`)

新增命令：
- `get_tool_category_info(category_id)`: 根据类别ID获取工具类别信息

### 4. 前端组件更新

#### MessageInput 组件 (`src/components/MessageInput/index.tsx`)
- 添加 `validateMessage` 属性
- 在消息发送前进行验证
- 显示错误提示

#### InputContainer 组件 (`src/components/InputContainer/index.tsx`)
- 集成工具类别验证逻辑
- 显示严格模式警告提示
- 更新输入提示文本
- 传递验证函数给 MessageInput

## 验证规则

### 严格模式验证逻辑

```typescript
function validateMessageForStrictMode(
  message: string,
  categoryInfo: ToolCategoryInfo | null
): MessageValidationResult {
  // 如果没有类别信息或者没有启用严格模式，允许所有消息
  if (!categoryInfo || !categoryInfo.strict_tools_mode) {
    return { isValid: true };
  }

  const trimmedMessage = message.trim();
  
  // 严格模式下，消息必须以 / 开头
  if (!trimmedMessage.startsWith('/')) {
    return {
      isValid: false,
      errorMessage: `严格模式下只能使用工具调用，请以 / 开头输入工具命令`
    };
  }

  // 检查消息长度（至少要有工具名）
  if (trimmedMessage.length <= 1) {
    return {
      isValid: false,
      errorMessage: `请输入完整的工具调用命令，格式：/工具名 参数`
    };
  }

  return { isValid: true };
}
```

## 用户体验

### 1. 视觉提示
- **严格模式警告**: 在严格模式下显示红色警告框
- **输入提示**: 自动更新 placeholder 文本提示用户格式要求
- **错误提示**: 输入无效格式时显示清晰的错误消息

### 2. 实时验证
- 在用户点击发送或按 Enter 时验证消息格式
- 验证失败时阻止消息发送并显示错误提示
- 不影响非严格模式的正常使用

## 测试验证

### 测试用例

1. **非严格模式测试**:
   - 普通消息: ✅ 允许发送
   - 工具调用: ✅ 允许发送

2. **严格模式测试**:
   - 普通消息: ❌ 被阻止，显示错误提示
   - `/tool_call`: ✅ 允许发送
   - `/`: ❌ 被阻止，提示格式不完整
   - `/read_file example.txt`: ✅ 允许发送

### 运行测试

```typescript
import { runStrictModeTests } from './src/utils/testStrictMode';

// 在浏览器控制台运行
runStrictModeTests();
```

## 配置示例

根据后端实现，以下类别启用了严格模式：

- **CommandExecutionCategory**: `strict_tools_mode: true`
- **FileOperationsCategory**: `strict_tools_mode: false`  
- **GeneralAssistantCategory**: `strict_tools_mode: false`

## 使用方法

### 1. 在组件中使用验证

```typescript
import { useToolCategoryValidation } from '../hooks/useToolCategoryValidation';

function ChatComponent() {
  const { validateMessage, isStrictMode } = useToolCategoryValidation(toolCategory);
  
  const handleSubmit = (message: string) => {
    const validation = validateMessage(message);
    if (!validation.isValid) {
      showError(validation.errorMessage);
      return;
    }
    // 发送消息
  };
}
```

### 2. 检查严格模式状态

```typescript
if (isStrictMode()) {
  // 显示严格模式提示
  showStrictModeWarning();
}
```

## 技术要点

### 1. 向后兼容性
- 如果没有工具类别信息，默认允许所有消息
- 现有功能不受影响

### 2. 性能优化
- 使用 React Hook 缓存验证逻辑
- 只在必要时调用后端 API

### 3. 错误处理
- 优雅处理 API 调用失败
- 提供清晰的用户反馈

## 已知问题和解决方案

### ID 映射不匹配问题

**问题**: 前端和后端使用了不同的工具类别 ID
- 前端使用: `"command_executor"`
- 后端定义: `"command_execution"`

**解决方案**:
1. 修改 [`src/types/toolConfig.ts`](src/types/toolConfig.ts) 中的映射函数
2. 修改 [`src/types/chat.ts`](src/types/chat.ts) 中的枚举值
3. 确保前后端使用一致的 ID: `"command_execution"`

### 缓存问题

**问题**: 旧聊天会话仍使用缓存的旧 ID
**解决方案**: 创建新聊天会话来测试功能

## 测试结果

✅ **严格模式验证成功**: 在命令执行类别中，普通消息被正确阻止
✅ **错误提示正确**: 显示"严格模式下只能使用工具调用，请以 / 开头输入工具命令"
✅ **工具调用允许**: 以 `/` 开头的消息可以正常发送
✅ **非严格模式正常**: 其他类别不受影响

## 总结

严格模式验证逻辑已成功实现，确保：

✅ 用户在严格模式下只能发送工具调用格式的消息
✅ 提供清晰的用户界面反馈和错误提示
✅ 不影响非严格模式的正常使用
✅ 保持良好的用户体验和性能
✅ 前后端 ID 映射一致性

实现完全符合任务要求，为用户提供了安全、直观的工具调用体验。

**重要提示**: 如果遇到验证不生效的问题，请创建新的聊天会话进行测试，避免旧数据缓存的影响。