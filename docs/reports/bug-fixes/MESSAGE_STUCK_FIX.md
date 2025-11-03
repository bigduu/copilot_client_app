# 消息"卡住"问题修复报告

## 问题描述

用户报告在发送消息后，消息显示"卡住"了。从日志中可以看到以下异常行为：

### 前端日志异常
```
chatInteractionMachine.ts:235 [ChatMachine] Entering IDLE state  (重复3次)
chatSessionSlice.ts:266 [ChatSlice] Skipping empty assistant message
```

### 后端日志正常
- Stream 正常完成
- 消息正确保存
- FSM 状态正常转换

## 根本原因分析

经过调查，发现了以下几个关键问题：

### 1. 状态机重复初始化
**位置**: `src/hooks/useChatManager.ts:82-113`

**问题**: `useMemo` 的依赖项包含了 `streamingMessageId` 和 `updateMessageContent`，导致每次这些值变化时，状态机都会重新创建。这导致状态机多次进入 IDLE 状态。

```typescript
// ❌ 问题代码
const providedChatMachine = useMemo(() => {
  return chatMachine.provide({
    actions: { ... }
  });
}, [streamingMessageId, updateMessageContent]); // 依赖项导致频繁重建
```

**修复**: 移除依赖项，状态机只在组件挂载时初始化一次。action 内部通过闭包访问最新的状态。

```typescript
// ✅ 修复后
const providedChatMachine = useMemo(() => {
  return chatMachine.provide({
    actions: { ... }
  });
}, []); // 只在组件挂载时初始化一次
```

### 2. SSE 流中 onDone 被调用两次
**位置**: `src/services/BackendContextService.ts:266-317`

**问题**: `sendMessageStream` 方法中，`onDone` 回调可能被调用两次：
1. 当解析到 `parsed.done` 时调用一次
2. 当 `while` 循环结束时再调用一次

```typescript
// ❌ 问题代码
while (true) {
  // ... 处理消息
  if (parsed.done) {
    onDone();  // 第一次调用
    return;
  }
}
onDone();  // 第二次调用（如果没有 return）
```

**修复**: 添加 `streamCompleted` 标志，防止重复调用。

```typescript
// ✅ 修复后
let streamCompleted = false;
while (true) {
  // ... 处理消息
  if (parsed.done) {
    streamCompleted = true;
    onDone();
    return;
  }
}
if (!streamCompleted) {
  onDone();
}
```

### 3. 陈旧闭包导致消息状态不一致
**位置**: `src/hooks/useChatManager.ts:275-289`

**问题**: `onChunk` 回调中使用的 `baseMessages` 是在函数开始时捕获的，可能已经过时。每次调用 `setMessages` 会触发重新渲染，导致 `baseMessages` 变化，但 `onChunk` 回调中的 `baseMessages` 仍然是旧值。

```typescript
// ❌ 问题代码
const sendMessage = useCallback(async (content: string) => {
  // baseMessages 在这里被捕获
  const messages = [...baseMessages, userMessage, assistantMessage];
  
  await backendService.sendMessageStream(
    chatId,
    content,
    (chunk: string) => {
      // 使用陈旧的 baseMessages
      const currentMessages = [...baseMessages, userMessage, updatedAssistant];
      setMessages(chatId, currentMessages);
    }
  );
}, [baseMessages, ...]);
```

**修复**: 在回调中从 store 实时获取最新的消息列表。

```typescript
// ✅ 修复后
(chunk: string) => {
  accumulatedContent += chunk;
  const updatedAssistantMessage = {
    ...assistantMessage,
    content: accumulatedContent,
  };
  // 从 store 获取最新状态，避免陈旧闭包
  const { chats } = useAppStore.getState();
  const currentChat = chats.find((c) => c.id === chatId);
  if (currentChat) {
    const updatedMessages = currentChat.messages.map((msg) =>
      msg.id === assistantMessageId ? updatedAssistantMessage : msg
    );
    setMessages(chatId, updatedMessages);
  }
}
```

## 影响范围

这些问题可能导致以下用户可见的症状：
1. 消息发送后 UI 没有更新或更新不完整
2. 加载指示器没有消失
3. 消息列表中出现重复或丢失的消息
4. 状态机状态异常

## 测试建议

修复后，请测试以下场景：
1. **基本消息发送**: 发送一条简单的消息，确认响应正常显示
2. **长响应流式传输**: 发送一个需要长响应的问题，确认流式传输平滑
3. **连续发送**: 快速连续发送多条消息，确认状态同步正常
4. **切换对话**: 在流式传输过程中切换到另一个对话，确认状态正确重置
5. **网络中断**: 模拟网络中断，确认错误处理正确

## 相关文件

- `src/hooks/useChatManager.ts` - 状态机初始化和消息发送逻辑
- `src/services/BackendContextService.ts` - SSE 流处理
- `src/store/slices/chatSessionSlice.ts` - 消息状态管理

## 参考

- 相关 Issue: 消息卡住问题
- 修复日期: 2025-11-03
- 修复人员: AI Assistant

