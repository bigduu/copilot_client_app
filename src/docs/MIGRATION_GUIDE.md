# UnifiedChatManager 迁移指南

## 概述

本指南将帮助您从当前的聊天架构迁移到新的 UnifiedChatManager 系统。新架构提供了更好的类型安全、原子操作支持、性能监控和错误处理能力。

## 迁移步骤

### 第一步：安装和导入

#### 旧架构
```typescript
import { useChats } from '../hooks/useChats';
import { useMessages } from '../hooks/useMessages';
import { ChatService } from '../services/ChatService';
```

#### 新架构
```typescript
import { useUnifiedChatManager } from '../hooks/useUnifiedChatManager';
import { ChatManagerFactory } from '../core/ChatManagerFactory';
import { UnifiedChatManager } from '../core/UnifiedChatManager';
```

### 第二步：状态管理迁移

#### 旧架构 - 多个Hook管理状态
```typescript
const MyComponent: React.FC = () => {
  const { chats, addChat, updateChat, deleteChat } = useChats();
  const { messages, addMessage, updateMessage } = useMessages();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  
  // 手动管理状态同步
  const currentChat = chats.find(chat => chat.id === currentChatId);
  const currentMessages = messages[currentChatId] || [];
  
  return (
    // 组件JSX
  );
};
```

#### 新架构 - 统一状态管理
```typescript
const MyComponent: React.FC = () => {
  const {
    manager,
    state,
    isInitialized,
    addChat,
    updateChat,
    deleteChat,
    addMessage,
    updateMessage,
    getCurrentChat,
    getAllChats,
    getChatMessages
  } = useUnifiedChatManager({
    scenario: ConfigurationScenario.DEVELOPMENT,
    onStateChange: (newState) => {
      console.log('状态已更新:', newState);
    }
  });
  
  // 自动管理的状态
  const currentChat = getCurrentChat();
  const allChats = getAllChats();
  const currentMessages = currentChat ? getChatMessages(currentChat.id) : [];
  
  return (
    // 组件JSX
  );
};
```

### 第三步：聊天操作迁移

#### 旧架构 - 直接调用服务
```typescript
// 创建聊天
const handleCreateChat = async (title: string) => {
  try {
    const newChat = await ChatService.createChat({
      title,
      systemPrompt: '',
      messages: []
    });
    addChat(newChat);
  } catch (error) {
    console.error('创建聊天失败:', error);
  }
};

// 发送消息
const handleSendMessage = async (content: string) => {
  try {
    const message = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content,
      timestamp: new Date()
    };
    addMessage(currentChatId!, message);
  } catch (error) {
    console.error('发送消息失败:', error);
  }
};
```

#### 新架构 - 原子操作
```typescript
// 创建聊天 - 带类型安全和错误处理
const handleCreateChat = async (title: string) => {
  const result = await addChat({
    title,
    systemPrompt: '你是一个helpful助手',
    autoApproval: true
  });
  
  if (result.success) {
    console.log('聊天创建成功:', result.data);
  } else {
    console.error('创建失败:', result.error);
  }
};

// 发送消息 - 自动处理ID生成和验证
const handleSendMessage = async (content: string) => {
  const currentChat = getCurrentChat();
  if (!currentChat) return;
  
  const result = await addMessage(currentChat.id, {
    content,
    role: 'user'
  });
  
  if (result.success) {
    console.log('消息发送成功:', result.data);
  } else {
    console.error('发送失败:', result.error);
  }
};
```

### 第四步：错误处理迁移

#### 旧架构 - 手动错误处理
```typescript
const [error, setError] = useState<string | null>(null);

const handleOperation = async () => {
  try {
    setError(null);
    await someOperation();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  }
};
```

#### 新架构 - 内置错误处理
```typescript
const { error, isLoading } = useUnifiedChatManager({
  onError: (err) => {
    // 自动错误处理和日志记录
    console.error('ChatManager错误:', err);
    // 可选：显示用户友好的错误消息
  }
});

const handleOperation = async () => {
  // 错误处理已内置在操作中
  const result = await addChat({ title: 'Test' });
  // result.success 和 result.error 提供明确的状态
};
```

### 第五步：批量操作迁移

#### 旧架构 - 手动循环操作
```typescript
const createMultipleChats = async (chatTitles: string[]) => {
  const results = [];
  for (const title of chatTitles) {
    try {
      const chat = await ChatService.createChat({ title });
      addChat(chat);
      results.push({ success: true, chat });
    } catch (error) {
      results.push({ success: false, error });
    }
  }
  return results;
};
```

#### 新架构 - 原生批量操作
```typescript
const createMultipleChats = async (chatTitles: string[]) => {
  if (!manager) return;
  
  const operations = chatTitles.map(title => ({
    type: 'addChat' as const,
    data: { title, systemPrompt: '' }
  }));
  
  const batchResult = await manager.batchOperation(operations);
  
  console.log(`成功: ${batchResult.successCount}, 失败: ${batchResult.failureCount}`);
  return batchResult;
};
```

## 工厂模式使用

### 不同环境的配置

```typescript
// 开发环境
const devManager = ChatManagerFactory.createForDevelopment();

// 生产环境
const prodManager = ChatManagerFactory.createForProduction();

// 测试环境
const testManager = ChatManagerFactory.createForTesting();

// 自定义配置
const customManager = ChatManagerFactory.createWithConfig({
  enablePerformanceMonitoring: true,
  enableAutoApproval: false,
  maxConcurrentOperations: 15,
  defaultErrorRetryCount: 2
});
```

### Hook便捷方法

```typescript
// 开发环境Hook
const { manager, state } = useDevChatManager();

// 生产环境Hook
const { manager, state } = useProdChatManager();

// 测试环境Hook
const { manager, state } = useTestChatManager();
```

## 性能优化建议

### 1. 使用适当的配置场景

```typescript
// 开发时使用开发配置（更多日志，更宽松的限制）
const { manager } = useDevChatManager();

// 生产时使用生产配置（性能优化，严格限制）
const { manager } = useProdChatManager();
```

### 2. 批量操作优化

```typescript
// 避免：多次单独操作
for (const item of items) {
  await addMessage(chatId, item);
}

// 推荐：使用批量操作
const operations = items.map(item => ({
  type: 'addMessage',
  chatId,
  data: item
}));
await manager.batchOperation(operations);
```

### 3. 状态订阅优化

```typescript
// 避免：频繁重新订阅
useEffect(() => {
  const unsubscribe = subscribeToState(handleStateChange);
  return unsubscribe;
}, [dependency]); // 依赖变化时重新订阅

// 推荐：稳定的订阅
const handleStateChange = useCallback((state) => {
  // 处理状态变化
}, []);

useEffect(() => {
  const unsubscribe = subscribeToState(handleStateChange);
  return unsubscribe;
}, []); // 仅初始化时订阅
```

## 类型安全改进

### 旧架构 - 弱类型
```typescript
const addMessage = (chatId: string, message: any) => {
  // 缺少类型检查
};
```

### 新架构 - 强类型
```typescript
const addMessage = async (
  chatId: string, 
  options: CreateMessageOptions
): Promise<OperationResult<string>> => {
  // 完整的类型检查和验证
};
```

## 错误处理改进

### 旧架构 - 异常抛出
```typescript
try {
  await riskyOperation();
} catch (error) {
  // 手动处理每个错误
}
```

### 新架构 - 结果模式
```typescript
const result = await addChat(options);
if (result.success) {
  // 处理成功情况
  console.log('聊天ID:', result.data);
} else {
  // 处理错误情况
  console.error('错误:', result.error);
  console.error('错误代码:', result.errorCode);
}
```

## 常见问题和解决方案

### Q1: 如何访问原始的ChatService功能？

A1: 通过manager实例访问底层组件：
```typescript
const { manager } = useUnifiedChatManager();

// 访问状态管理器
const chat = manager.stateManager.getChat(chatId);

// 访问性能监控
const metrics = manager.performanceMonitor.getMetrics();
```

### Q2: 如何处理现有的聊天数据？

A2: 使用迁移辅助函数：
```typescript
const migrateExistingChats = async (existingChats: OldChatType[]) => {
  const operations = existingChats.map(chat => ({
    type: 'addChat' as const,
    data: {
      title: chat.title,
      systemPrompt: chat.systemPrompt || '',
      // 转换其他属性
    }
  }));
  
  await manager.batchOperation(operations);
};
```

### Q3: 如何自定义错误处理？

A3: 在Hook配置中提供错误处理回调：
```typescript
const { manager } = useUnifiedChatManager({
  onError: (error) => {
    // 自定义错误处理逻辑
    if (error.message.includes('network')) {
      showNetworkErrorDialog();
    } else {
      showGenericErrorToast(error.message);
    }
  }
});
```

## 迁移检查清单

- [ ] 替换现有的Hook导入
- [ ] 更新聊天创建逻辑
- [ ] 更新消息发送逻辑
- [ ] 实现新的错误处理模式
- [ ] 迁移批量操作（如果有）
- [ ] 更新状态访问方式
- [ ] 测试所有功能
- [ ] 性能基准测试
- [ ] 更新文档和注释

## 总结

UnifiedChatManager提供了：

1. **类型安全**: 完整的TypeScript类型定义
2. **错误处理**: 内置的错误处理和恢复机制
3. **性能监控**: 自动的性能指标收集
4. **原子操作**: 可靠的数据操作保证
5. **批量操作**: 高效的批量数据处理
6. **配置灵活性**: 多种预设配置和自定义选项

迁移后，您将获得更稳定、更高性能且更易维护的聊天系统。