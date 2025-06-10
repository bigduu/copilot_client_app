# SystemPromptSelector 组件

## 概述

`SystemPromptSelector` 是一个专门用于选择 System Prompt 预设的组件，支持按工具类别分组显示，显示能力描述而非完整 prompt 内容。

## 功能特点

- ✅ 按工具类别分组显示预设
- ✅ 显示能力描述而非完整 prompt 内容  
- ✅ 支持工具专用模式的额外信息显示
- ✅ 可折叠的类别面板
- ✅ 响应式设计和主题适配
- ✅ 类别图标和颜色标识

## 组件结构

```
src/components/SystemPromptSelector/
├── index.tsx              # 主要的 SystemPromptSelector 组件
├── NewChatSelector.tsx    # 新建聊天专用的选择器
└── README.md             # 使用文档
```

## 使用方法

### 1. 基础使用

```tsx
import SystemPromptSelector from '../SystemPromptSelector';
import { useChat } from '../../contexts/ChatContext';

const MyComponent = () => {
  const [showSelector, setShowSelector] = useState(false);
  const { systemPromptPresets } = useChat();

  const handlePresetSelect = (preset: SystemPromptPreset) => {
    console.log('选择的预设:', preset);
    // 处理预设选择逻辑
  };

  return (
    <>
      <Button onClick={() => setShowSelector(true)}>
        选择 System Prompt
      </Button>
      
      <SystemPromptSelector
        open={showSelector}
        onClose={() => setShowSelector(false)}
        onSelect={handlePresetSelect}
        presets={systemPromptPresets}
      />
    </>
  );
};
```

### 2. 新建聊天时使用

```tsx
import NewChatSelector from '../SystemPromptSelector/NewChatSelector';

const ChatSidebar = () => {
  const [showNewChatSelector, setShowNewChatSelector] = useState(false);

  const handleChatCreated = (chatId: string) => {
    console.log('新聊天已创建:', chatId);
  };

  return (
    <>
      <Button 
        type="primary" 
        onClick={() => setShowNewChatSelector(true)}
      >
        新建聊天
      </Button>
      
      <NewChatSelector
        visible={showNewChatSelector}
        onClose={() => setShowNewChatSelector(false)}
        onChatCreated={handleChatCreated}
      />
    </>
  );
};
```

### 3. 在 InputContainer 中集成

```tsx
// 在 InputContainer 组件中添加新建聊天功能
const InputContainer = ({ isStreaming, isCenteredLayout }) => {
  const [showNewChatSelector, setShowNewChatSelector] = useState(false);
  const { currentMessages } = useChat();

  // 当没有消息时显示新建聊天按钮
  const showNewChatButton = currentMessages.length === 0;

  return (
    <div>
      {showNewChatButton && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Button 
            type="primary" 
            size="large"
            onClick={() => setShowNewChatSelector(true)}
          >
            选择 System Prompt 开始聊天
          </Button>
        </div>
      )}
      
      {/* 现有的输入组件 */}
      <Space.Compact block>
        {/* ... 现有代码 ... */}
      </Space.Compact>

      <NewChatSelector
        visible={showNewChatSelector}
        onClose={() => setShowNewChatSelector(false)}
      />
    </div>
  );
};
```

## 属性说明

### SystemPromptSelector 属性

| 属性 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `open` | `boolean` | ✅ | - | 是否显示选择器 |
| `onClose` | `() => void` | ✅ | - | 关闭回调 |
| `onSelect` | `(preset: SystemPromptPreset) => void` | ✅ | - | 选择预设回调 |
| `presets` | `SystemPromptPresetList` | ✅ | - | 预设列表 |
| `title` | `string` | ❌ | "选择 System Prompt" | 模态框标题 |
| `showCancelButton` | `boolean` | ❌ | `true` | 是否显示取消按钮 |

### NewChatSelector 属性

| 属性 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `visible` | `boolean` | ✅ | - | 是否显示选择器 |
| `onClose` | `() => void` | ✅ | - | 关闭回调 |
| `onChatCreated` | `(chatId: string) => void` | ❌ | - | 聊天创建成功回调 |

## 类别支持

组件支持以下工具类别：

- `GENERAL` - 通用助手 (蓝色)
- `FILE_READER` - 文件读取 (绿色)  
- `FILE_CREATOR` - 文件创建 (橙色)
- `FILE_DELETER` - 文件删除 (红色)
- `FILE_UPDATER` - 文件更新 (紫色)
- `FILE_SEARCHER` - 文件搜索 (青色)
- `COMMAND_EXECUTOR` - 命令执行 (品红色)

## 数据结构

组件期望的 `SystemPromptPreset` 数据结构：

```typescript
interface SystemPromptPreset {
  id: string;                        // 唯一标识
  name: string;                      // 预设名称
  content: string;                   // Prompt 内容
  description: string;               // 能力描述
  category: string;                  // 工具类别
  mode: 'general' | 'tool_specific'; // 模式类型
  autoToolPrefix?: string;           // 自动工具前缀
  allowedTools?: string[];           // 允许的工具列表
  restrictConversation?: boolean;    // 是否限制普通对话
}
```

## 样式定制

组件使用 Ant Design 的主题系统，会自动适配当前主题的颜色和尺寸。如需自定义样式，可以通过 CSS 覆盖相关类名。

## 注意事项

1. 确保在使用前已经正确配置了 `ChatContext` 和相关的服务
2. 组件依赖 `SystemPromptService` 来获取和管理预设数据
3. 新建聊天功能需要确保 `useChatManager` 中的 `addChat` 和 `updateChat` 方法可用
4. 建议在应用启动时预加载 SystemPrompt 预设数据