# 工具批准卡片重复显示问题修复总结

## 问题描述
ToolApprovalCard 在用户批准工具执行后仍然重复出现，导致用户可以多次批准同一个工具。

## 根本原因分析
1. **工具调用解析逻辑问题**：MessageCard 组件在每次渲染时都会重新解析消息内容中的工具调用
2. **状态管理缺失**：没有跟踪工具的执行状态（待批准、已批准、已拒绝、已执行）
3. **消息内容未更新**：工具执行后，原始消息内容保持不变，导致重新解析时仍然发现相同的工具调用

## 解决方案

### 1. 扩展 Message 类型
**文件**: `src/types/chat.ts`
- 添加 `ToolExecutionStatus` 类型：`'pending' | 'approved' | 'rejected' | 'executed'`
- 在 `Message` 接口中添加 `toolExecutionStatus?: Record<string, ToolExecutionStatus>` 字段

### 2. 修改 MessageCard 组件
**文件**: `src/components/ChatView/Message/MessageCard/index.tsx`

#### 新增功能：
- **工具状态过滤**：只显示状态为 'pending' 或未设置状态的工具调用
- **状态管理**：添加 `message` 和 `onMessageUpdate` props
- **状态更新逻辑**：
  - 批准时：立即设置状态为 'approved'，执行完成后设置为 'executed'
  - 拒绝时：设置状态为 'rejected'

#### 代码更改：
```typescript
// 过滤已执行/拒绝的工具调用
const allToolCalls = toolParser.parseToolCallsFromContent(content);
const toolExecutionStatus = message?.toolExecutionStatus || {};
const pendingToolCalls = allToolCalls.filter((toolCall) => {
  const status = toolExecutionStatus[toolCall.tool_name];
  return !status || status === "pending";
});

// 批准处理器中的状态更新
if (messageId && onMessageUpdate) {
  const currentStatus = message?.toolExecutionStatus || {};
  onMessageUpdate(messageId, {
    toolExecutionStatus: {
      ...currentStatus,
      [toolCall.tool_name]: "approved",
    },
  });
}

// 执行完成后更新状态为 'executed'
if (messageId && onMessageUpdate) {
  const currentStatus = message?.toolExecutionStatus || {};
  onMessageUpdate(messageId, {
    toolExecutionStatus: {
      ...currentStatus,
      [toolCall.tool_name]: "executed",
    },
  });
}
```

### 3. 更新 ChatView 组件
**文件**: `src/components/ChatView/index.tsx`

#### 新增功能：
- 传递完整的 `message` 对象到 MessageCard
- 添加 `onMessageUpdate` 回调函数来更新消息状态
- 实现消息状态的持久化更新

#### 代码更改：
```typescript
<MessageCard
  // ... 其他 props
  message={message} // 传递完整消息对象
  onMessageUpdate={(messageId, updates) => {
    // 更新聊天中的消息
    if (currentChatId) {
      const updatedMessages = currentMessages.map((msg, idx) => {
        if (
          msg.id === messageId ||
          `msg-${currentChatId}-${idx}` === messageId
        ) {
          return { ...msg, ...updates };
        }
        return msg;
      });
      updateChat(currentChatId, { messages: updatedMessages });
    }
  }}
  // ... 其他 props
/>
```

## 实施效果

### 解决的问题：
1. ✅ **工具批准卡片不再重复显示**：一旦工具被批准或拒绝，相应的卡片就会从界面中消失
2. ✅ **状态持久化**：工具执行状态会被保存到消息对象中
3. ✅ **用户体验改善**：用户不能意外地多次批准同一个工具
4. ✅ **状态跟踪**：系统可以清楚地知道每个工具的当前状态

### 工作流程：
1. AI 回复包含工具调用 → 显示 ToolApprovalCard
2. 用户点击批准 → 状态设为 'approved' → 卡片消失 → 工具执行
3. 工具执行完成 → 状态设为 'executed' → 创建结果消息
4. 如果用户点击拒绝 → 状态设为 'rejected' → 卡片消失

### 兼容性：
- ✅ 向后兼容：现有的消息不会受到影响
- ✅ 优雅降级：如果消息没有 `toolExecutionStatus` 字段，默认显示所有工具调用
- ✅ 类型安全：所有新增字段都是可选的

## 技术细节

### 状态流转：
```
undefined/pending → approved → executed
                ↘ rejected
```

### 数据结构：
```typescript
interface Message {
  // ... 现有字段
  toolExecutionStatus?: Record<string, ToolExecutionStatus>;
}

// 示例：
{
  "toolExecutionStatus": {
    "execute_command": "executed",
    "create_file": "rejected"
  }
}
```

### 性能优化：
- 使用过滤器减少不必要的 DOM 渲染
- 状态更新是增量的，不会影响其他工具的状态
- 消息更新使用不可变更新模式

## 测试建议
1. 测试工具批准后卡片是否消失
2. 测试工具拒绝后卡片是否消失
3. 测试多个工具调用的独立状态管理
4. 测试页面刷新后状态是否保持
5. 测试向后兼容性（旧消息的显示）

## 未来改进空间
1. 可以添加"重新批准"功能，允许用户重新执行被拒绝的工具
2. 可以添加工具执行历史记录
3. 可以添加批量操作（批准所有、拒绝所有）
4. 可以添加工具执行进度指示器
