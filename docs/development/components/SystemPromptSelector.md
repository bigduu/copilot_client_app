# SystemPromptSelector Component

## Overview

`SystemPromptSelector` is a specialized component for selecting System Prompt presets, supporting grouping by tool category and displaying capability descriptions instead of full prompt content.

## Features

- ✅ Group presets by tool category
- ✅ Display capability descriptions instead of full prompt content
- ✅ Support additional information display for tool-specific modes
- ✅ Collapsible category panels
- ✅ Responsive design and theme adaptation
- ✅ Category icons and color indicators

## Component Structure

```
src/components/SystemPromptSelector/
├── index.tsx              # Main SystemPromptSelector component
├── NewChatSelector.tsx    # Selector for creating new chats
└── README.md             # Usage documentation
```

## Usage

### 1. Basic Usage

```tsx
import SystemPromptSelector from '../SystemPromptSelector';
import { useChat } from '../../contexts/ChatContext';

const MyComponent = () => {
  const [showSelector, setShowSelector] = useState(false);
  const { systemPromptPresets } = useChat();

  const handlePresetSelect = (preset: SystemPromptPreset) => {
    console.log('Selected preset:', preset);
    // Handle preset selection logic
  };

  return (
    <>
      <Button onClick={() => setShowSelector(true)}>
        Select System Prompt
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

### 2. Usage When Creating New Chats

```tsx
import NewChatSelector from '../SystemPromptSelector/NewChatSelector';

const ChatSidebar = () => {
  const [showNewChatSelector, setShowNewChatSelector] = useState(false);

  const handleChatCreated = (chatId: string) => {
    console.log('New chat created:', chatId);
  };

  return (
    <>
      <Button
        type="primary"
        onClick={() => setShowNewChatSelector(true)}
      >
        New Chat
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

### 3. Integration in InputContainer

```tsx
// Add new chat functionality in InputContainer component
const InputContainer = ({ isStreaming, isCenteredLayout }) => {
  const [showNewChatSelector, setShowNewChatSelector] = useState(false);
  const { currentMessages } = useChat();

  // Show new chat button when there are no messages
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
            Select System Prompt to Start Chat
          </Button>
        </div>
      )}

      {/* Existing input components */}
      <Space.Compact block>
        {/* ... existing code ... */}
      </Space.Compact>

      <NewChatSelector
        visible={showNewChatSelector}
        onClose={() => setShowNewChatSelector(false)}
      />
    </div>
  );
};
```

## Props Reference

### SystemPromptSelector Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | `boolean` | ✅ | - | Whether to show the selector |
| `onClose` | `() => void` | ✅ | - | Close callback |
| `onSelect` | `(preset: SystemPromptPreset) => void` | ✅ | - | Preset selection callback |
| `presets` | `SystemPromptPresetList` | ✅ | - | List of presets |
| `title` | `string` | ❌ | "Select System Prompt" | Modal title |
| `showCancelButton` | `boolean` | ❌ | `true` | Whether to show cancel button |

### NewChatSelector Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `visible` | `boolean` | ✅ | - | Whether to show the selector |
| `onClose` | `() => void` | ✅ | - | Close callback |
| `onChatCreated` | `(chatId: string) => void` | ❌ | - | Callback when chat is created successfully |

## Category Support

The component supports the following tool categories:

- `GENERAL` - General Assistant (Blue)
- `FILE_READER` - File Reader (Green)
- `FILE_CREATOR` - File Creator (Orange)
- `FILE_DELETER` - File Deleter (Red)
- `FILE_UPDATER` - File Updater (Purple)
- `FILE_SEARCHER` - File Searcher (Cyan)
- `COMMAND_EXECUTOR` - Command Executor (Magenta)

## Data Structure

The expected `SystemPromptPreset` data structure:

```typescript
interface SystemPromptPreset {
  id: string;                        // Unique identifier
  name: string;                      // Preset name
  content: string;                   // Prompt content
  description: string;               // Capability description
  category: string;                  // Tool category
  mode: 'general' | 'tool_specific'; // Mode type
  autoToolPrefix?: string;           // Auto tool prefix
  allowedTools?: string[];           // Allowed tools list
  restrictConversation?: boolean;    // Whether to restrict normal conversation
}
```

## Styling Customization

The component uses Ant Design's theme system and automatically adapts to the current theme's colors and dimensions. For custom styling, you can override relevant CSS classes.

## Important Notes

1. Ensure `ChatContext` and related services are properly configured before use
2. The component depends on `SystemPromptService` to fetch and manage preset data
3. The new chat feature requires `addChat` and `updateChat` methods in `useChatManager` to be available
4. It is recommended to preload SystemPrompt preset data when the application starts