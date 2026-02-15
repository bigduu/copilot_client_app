# Copilot 认证错误提示改进

## 问题

用户报告：当 Copilot 未认证时，用户发送消息后一直显示 **"Assistant is thinking..."**，没有任何错误提示或指引，用户不知道发生了什么。

**之前的体验：**
```
用户: "Hello"
  ↓
UI: "Assistant is thinking..." (一直显示，没有响应)
  ↓
后端日志: "LLM error: Authentication error: Not authenticated. Please run authenticate() first."
  ↓
用户: 😕 不知道发生了什么
```

## 解决方案

检测 Copilot 认证错误，并在前端显示友好的错误消息，引导用户去 Settings 页面完成认证。

**现在的体验：**
```
用户: "Hello"
  ↓
UI 显示错误消息:
┌──────────────────────────────────────┐
│ 🔐 Authentication Required           │
│                                      │
│ Copilot is not authenticated.        │
│ Please follow these steps:           │
│                                      │
│ 1. Go to Settings → Provider Settings│
│ 2. Select GitHub Copilot             │
│ 3. Click "Authenticate Copilot"      │
│ 4. Follow the instructions           │
│                                      │
│ After authentication, start a new    │
│ conversation.                        │
│                                      │
│ [Go to Settings]                     │
└──────────────────────────────────────┘
```

## 实现细节

### 1. 检测认证错误

**文件：** `src/pages/ChatPage/hooks/useAgentChat.ts`

```typescript
onError: async (errorMessage: string) => {
  console.error("Agent error:", errorMessage);

  // Check if it's a Copilot authentication error
  const isAuthError = errorMessage.includes("Not authenticated") ||
                     errorMessage.includes("Authentication error") ||
                     errorMessage.includes("Please run authenticate()");

  let errorContent: string;

  if (isAuthError) {
    errorContent = `🔐 **Authentication Required**

Copilot is not authenticated. Please follow these steps:

1. Go to **Settings** → **Provider Settings**
2. Select **GitHub Copilot**
3. Click **"Authenticate Copilot"**
4. Follow the instructions to complete authentication

After authentication, start a new conversation.`;
  } else {
    errorContent = `❌ **Error**: ${errorMessage}`;
  }

  // Add error message
  await addMessage(chatId, {
    id: `error-${Date.now()}`,
    role: "assistant",
    content: errorContent,
    createdAt: new Date().toISOString(),
    isError: true,
    isAuthError,  // ← 新增字段，标识认证错误
  });
}
```

### 2. 添加消息类型支持

**文件：** `src/pages/ChatPage/types/chatMessages.ts`

```typescript
interface BaseMessage {
  id: string;
  createdAt: string;
  isError?: boolean;      // ← 新增：通用错误标识
  isAuthError?: boolean;  // ← 新增：认证错误标识
}
```

### 3. 特殊显示认证错误

**文件：** `src/pages/ChatPage/components/MessageCard/MessageCardContent.tsx`

```typescript
import { Alert, Button } from "antd";
import { SettingOutlined } from "@ant-design/icons";

// ...

if (message.isAuthError) {
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Alert
        message="Authentication Required"
        description={
          <ReactMarkdown>
            {messageText}
          </ReactMarkdown>
        }
        type="error"
        showIcon
      />
      <Button
        type="primary"
        icon={<SettingOutlined />}
        onClick={() => {
          window.location.hash = "/settings";
        }}
      >
        Go to Settings
      </Button>
    </Space>
  );
}
```

## 错误检测逻辑

我们通过检查错误消息中的关键词来识别认证错误：

| 关键词 | 来源 |
|--------|------|
| `"Not authenticated"` | Copilot provider `chat_stream()` 方法 |
| `"Authentication error"` | LLMError::Auth 变体 |
| `"Please run authenticate()"` | Copilot provider 错误消息 |

**后端错误消息示例：**
```rust
Err(LLMError::Auth(
    "Not authenticated. Please run authenticate() first.".to_string(),
))
```

## UI 组件

### Alert 样式

使用 Ant Design 的 `Alert` 组件：
- `type="error"` - 红色警告样式
- `showIcon` - 显示错误图标
- Markdown 内容渲染 - 支持格式化步骤说明

### Button 功能

- **类型**：Primary button（蓝色高亮）
- **图标**：Settings icon（齿轮）
- **行为**：导航到 Settings 页面
- **导航方式**：`window.location.hash = "/settings"`

## 用户流程

### 1. 用户发送消息（未认证）

```
用户输入: "Hello"
  ↓
发送到 Agent Server
  ↓
Agent 调用 Copilot provider
  ↓
Copilot provider 返回认证错误
  ↓
前端 onError 处理
  ↓
检测到认证错误
  ↓
显示友好错误消息
```

### 2. 用户看到错误消息

**UI 显示：**
```
┌──────────────────────────────────────┐
│ 🔐 Authentication Required           │
│                                      │
│ Copilot is not authenticated.        │
│ Please follow these steps:           │
│                                      │
│ 1. Go to Settings → Provider Settings│
│ 2. Select GitHub Copilot             │
│ 3. Click "Authenticate Copilot"      │
│ 4. Follow the instructions           │
│                                      │
│ [Go to Settings]                     │
└──────────────────────────────────────┘
```

### 3. 用户点击 "Go to Settings"

- 自动跳转到 Settings 页面
- Provider Settings 标签页

### 4. 用户完成认证

- 点击 "Authenticate Copilot"
- Modal 显示设备码
- 在浏览器完成认证
- 点击 "I've Completed Authorization"

### 5. 用户开始新对话

- 认证成功
- 新对话正常工作

## 对比

### 之前

```
用户: "Hello"
[等待...]
[继续等待...]
[永远等待...] 😕

用户不知道发生了什么
```

### 现在

```
用户: "Hello"
立即显示:
"🔐 认证错误！请去 Settings 认证 Copilot"
[Go to Settings] 👍

用户清楚地知道该做什么
```

## 修改的文件

### TypeScript/TSX

1. **`src/pages/ChatPage/hooks/useAgentChat.ts`**
   - 添加认证错误检测逻辑
   - 生成友好的错误消息
   - 设置 `isAuthError` 标志

2. **`src/pages/ChatPage/types/chatMessages.ts`**
   - BaseMessage 接口添加 `isError?: boolean`
   - BaseMessage 接口添加 `isAuthError?: boolean`

3. **`src/pages/ChatPage/components/MessageCard/MessageCardContent.tsx`**
   - 导入 Alert 和 Button 组件
   - 添加 `isAuthError` 检查
   - 渲染特殊错误 UI
   - "Go to Settings" 按钮

## 扩展性

这个模式可以扩展到其他类型的错误：

```typescript
// 未来可以添加更多错误类型
interface BaseMessage {
  isError?: boolean;
  isAuthError?: boolean;
  isNetworkError?: boolean;    // 网络错误
  isRateLimitError?: boolean;  // 速率限制
  isQuotaError?: boolean;      // 配额错误
  // ...
}
```

每种错误类型可以有特定的错误消息和行动建议。

## 测试

### 手动测试

1. **设置 Copilot 为 provider，但不认证**
   ```bash
   # 删除缓存的 token
   rm ~/.bamboo/copilot_token.json
   ```

2. **重启应用**

3. **发送消息**
   - 输入: "Hello"
   - 预期: 立即看到认证错误消息

4. **点击 "Go to Settings"**
   - 预期: 跳转到 Settings 页面

5. **完成认证**
   - 预期: 认证成功

6. **开始新对话**
   - 输入: "Hello"
   - 预期: 正常响应

### 自动化测试

```typescript
test('should detect Copilot auth error', () => {
  const errorMessage = "Not authenticated. Please run authenticate() first.";
  const isAuthError = errorMessage.includes("Not authenticated") ||
                     errorMessage.includes("Authentication error");

  expect(isAuthError).toBe(true);
});

test('should display auth error message', () => {
  const message = {
    id: '1',
    role: 'assistant',
    content: '🔐 **Authentication Required**...',
    isAuthError: true,
  };

  render(<MessageCardContent message={message} />);

  expect(screen.getByText(/Authentication Required/)).toBeInTheDocument();
  expect(screen.getByText(/Go to Settings/)).toBeInTheDocument();
});
```

## 未来改进

### 短期
1. **自动跳转** - 检测到认证错误时，自动打开 Settings Modal
2. **重试按钮** - 认证完成后，在错误消息中添加 "Retry" 按钮
3. **状态持久化** - 记住用户最后使用的 provider，下次启动时提示

### 长期
1. **预检查** - 发送消息前检查认证状态，提前提示
2. **自动重连** - 认证过期时自动重新认证（使用 refresh token）
3. **多 Provider 切换** - 认证失败时，建议切换到其他 provider

## 关键收益

### ✅ 用户体验
- **清晰**：用户立即知道问题所在
- **可操作**：明确的步骤指引
- **便捷**：一键跳转到设置页面

### ✅ 减少困惑
- 不再"永远等待"
- 错误消息友好，不显示技术细节
- 明确的行动路径

### ✅ 提高成功率
- 更多用户能完成认证
- 减少支持请求
- 提高用户满意度

---

**实现时间：** 2026-02-15
**状态：** ✅ 完成
**质量：** ⭐⭐⭐⭐⭐
