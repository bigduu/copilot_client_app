# File Reference AI Agent Mode - 实现计划

## 📋 目标

将文件引用功能从"直接显示工具结果"改为"AI Agent 模式"：
1. **多文件/文件夹选择**：用户可以选择多个文件或文件夹
2. **智能工具选择**：
   - 文件 → `read_file` 工具
   - 文件夹 → `list_directory` 工具（depth=1）
3. **AI Agent 模式**：工具结果隐藏，AI 解释内容
4. **流式响应**：用户看到 AI 的实时回复

---

## Phase 1: 前端支持多文件选择

### Task 1.1: 修改前端数据结构

#### 文件：`src/types/chat.ts`

```typescript
export interface UserFileReferenceMessage extends BaseMessage {
  role: "user";
  type: "file_reference";
  paths: string[];  // ✅ 改为数组，支持多文件
  displayText: string;
}
```

#### 文件：`src/components/InputContainer/index.tsx`

**修改发送逻辑（第 153-175 行）**：

```typescript
// 当前：只处理第一个文件引用
const fileRefMatches = composedMessage.matchAll(/@([^\s]+)/g);
const matches = Array.from(fileRefMatches);

if (matches.length > 0 && fileReferences.size > 0) {
  // ✅ 收集所有引用的文件
  const referencedFiles: WorkspaceFileEntry[] = [];
  for (const match of matches) {
    const fileName = match[1];
    const fileEntry = fileReferences.get(fileName);
    if (fileEntry) {
      referencedFiles.push(fileEntry);
    }
  }

  if (referencedFiles.length > 0) {
    const structuredMessage = JSON.stringify({
      type: "file_reference",
      paths: referencedFiles.map(f => f.path),  // ✅ 路径数组
      display_text: composedMessage,
    });
    sendMessage(structuredMessage, images);
  } else {
    sendMessage(composedMessage, images);
  }
} else {
  sendMessage(composedMessage, images);
}
```

### Task 1.2: 修改 FileReferenceCard 支持多文件显示

#### 文件：`src/components/FileReferenceCard/index.tsx`

```typescript
export interface FileReferenceCardProps {
  paths: string[];  // ✅ 改为数组
  displayText: string;
  timestamp?: string;
}

const FileReferenceCardComponent: React.FC<FileReferenceCardProps> = ({
  paths,
  displayText,
}) => {
  const { token } = theme.useToken();

  return (
    <div style={{ ... }}>
      {/* 文件列表 */}
      <Space direction="vertical" size={token.marginXXS}>
        {paths.map((path, index) => {
          const fileName = path.split("/").pop() || path;
          const directory = path.substring(0, path.lastIndexOf("/")) || "";
          const isFolder = !fileName.includes(".");  // ✅ 简单判断是否为文件夹
          
          return (
            <Space key={index} size={token.marginXS} align="center">
              {isFolder ? (
                <FolderOutlined style={{ color: token.colorWarning }} />
              ) : (
                <FileTextOutlined style={{ color: token.colorPrimary }} />
              )}
              <Tag color={isFolder ? "orange" : "blue"}>
                {fileName}
              </Tag>
              {directory && (
                <Tooltip title={path}>
                  <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {directory}
                  </Text>
                </Tooltip>
              )}
            </Space>
          );
        })}
      </Space>

      {/* 用户问题 */}
      {userQuestion && (
        <Text style={{ marginTop: token.marginXS }}>
          {userQuestion}
        </Text>
      )}
    </div>
  );
};
```

### Task 1.3: 修改消息转换器

#### 文件：`src/utils/messageTransformers.ts`

```typescript
// 检测文件引用模式（支持多个 @filename）
const fileMatches = Array.from(baseContent.matchAll(/@([^\s]+)/g));
if (fileMatches.length > 0) {
  const paths = fileMatches.map(match => match[1]);
  const fileRefMessage: UserFileReferenceMessage = {
    id: dto.id,
    role: "user",
    type: "file_reference",
    paths,  // ✅ 路径数组
    displayText: baseContent,
    createdAt: createTimestamp(),
  };
  return fileRefMessage;
}
```

---

## Phase 2: 后端支持多文件和文件夹处理

### Task 2.1: 修改后端数据结构

#### 文件：`crates/web_service/src/models.rs`

```rust
#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessagePayload {
    Text { content: String, display: Option<String> },
    FileReference {
        paths: Vec<String>,  // ✅ 改为 Vec<String>
        display_text: Option<String>,
    },
    Workflow { ... },
    ToolResult { ... },
}
```

### Task 2.2: 实现智能文件/文件夹处理

#### 文件：`crates/web_service/src/services/chat_service.rs`

**新增辅助函数**：

```rust
/// 判断路径是文件还是文件夹
fn is_directory(path: &str) -> bool {
    std::path::Path::new(path).is_dir()
}

/// 为单个路径选择合适的工具
async fn process_single_path(
    context: &Arc<tokio::sync::RwLock<ChatContext>>,
    runtime: &ContextToolRuntime,
    path: &str,
) -> Result<(), AppError> {
    if is_directory(path) {
        // 文件夹：使用 list_directory 工具
        let mut arguments = serde_json::Map::new();
        arguments.insert("path".to_string(), json!(path));
        arguments.insert("depth".to_string(), json!(1));  // ✅ 只列出第一层
        
        let mut context_lock = context.write().await;
        context_lock
            .process_auto_tool_step(
                runtime,
                "list_directory".to_string(),
                serde_json::Value::Object(arguments),
                false,
                None,
            )
            .await
            .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?;
    } else {
        // 文件：使用 read_file 工具
        let mut arguments = serde_json::Map::new();
        arguments.insert("path".to_string(), json!(path));
        
        let mut context_lock = context.write().await;
        context_lock
            .process_auto_tool_step(
                runtime,
                "read_file".to_string(),
                serde_json::Value::Object(arguments),
                false,
                None,
            )
            .await
            .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?;
    }
    
    Ok(())
}
```

**修改 `execute_file_reference` 方法**：

```rust
async fn execute_file_reference(
    &self,
    context: &Arc<tokio::sync::RwLock<ChatContext>>,
    paths: &[String],  // ✅ 改为数组
    display_text: &str,
    metadata: &ClientMessageMetadata,
) -> Result<(), AppError> {  // ✅ 改为返回 ()
    // 1. 添加用户消息
    let incoming = build_incoming_text_message(display_text, Some(display_text), metadata);
    self.apply_incoming_message(context, incoming).await?;
    self.auto_save_context(context).await?;

    let runtime = ContextToolRuntime::new(
        self.tool_executor.clone(),
        self.approval_manager.clone()
    );

    // 2. 为每个路径执行相应的工具
    for path in paths {
        process_single_path(context, &runtime, path).await?;
    }

    self.auto_save_context(context).await?;
    
    // ✅ 不返回 FinalizedMessage，让调用者继续执行 AI 流程
    Ok(())
}
```

### Task 2.3: 修改调用点

#### 文件：`crates/web_service/src/services/chat_service.rs`

**修改 `process_message` 方法（第 548-573 行）**：

```rust
match &request.payload {
    MessagePayload::FileReference { paths, .. } => {
        // ✅ 执行文件引用，但不返回
        self.execute_file_reference(
            &context,
            paths,  // ✅ 传递路径数组
            &display_text,
            &request.client_metadata,
        )
        .await?;
        
        // ✅ 不要 return，继续执行下面的 LLM 调用
    }
    MessagePayload::Text { content, display } => {
        let incoming = build_incoming_text_message(
            content,
            display.as_deref(),
            &request.client_metadata,
        );
        self.apply_incoming_message(&context, incoming).await?;
        self.auto_save_context(&context).await?;
    }
    // ... 其他 payload 类型 ...
}

// ✅ 所有 payload 类型都会执行到这里，调用 AI
let llm_request = self.llm_request_builder().build(&context).await?;
// ... 调用 AI ...
```

**修改 `process_message_stream` 方法（第 971-991 行）**：

```rust
match &request.payload {
    MessagePayload::FileReference { paths, .. } => {
        // ✅ 执行文件引用，但不返回
        self.execute_file_reference(
            &context,
            paths,
            &display_text,
            &request.client_metadata,
        )
        .await?;
        
        // ✅ 不要 return，继续执行下面的流式 AI 调用
    }
    // ...
}

// ✅ 继续执行流式 AI 调用
let (event_tx, event_rx) = mpsc::channel::<sse::Event>(100);
// ...
```

---

## Phase 3: 工具结果隐藏和 AI 调用

### Task 3.1: 设置工具结果为 Hidden

#### 文件：`crates/context_manager/src/structs/context_lifecycle.rs`

**修改 `process_auto_tool_step` 方法（第 769-920 行）**：

```rust
pub async fn process_auto_tool_step<R: crate::traits::ToolRuntime + ?Sized>(
    &mut self,
    runtime: &R,
    tool_name: String,
    arguments: serde_json::Value,
    terminate: bool,
    request_id: Option<Uuid>,
) -> Result<Vec<ContextUpdate>, crate::error::ContextError> {
    // ... 执行工具 ...
    
    match runtime.execute_tool(&tool_name, &arguments).await {
        Ok(mut result) => {
            // ✅ 为 read_file 和 list_directory 设置 Hidden
            if tool_name == "read_file" || tool_name == "list_directory" {
                result.as_object_mut().map(|obj| {
                    obj.insert("display_preference".to_string(), json!("Hidden"));
                });
            }
            
            // ... 创建 tool result 消息 ...
        }
    }
}
```

### Task 3.2: 前端过滤隐藏的工具结果

#### 文件：`src/components/MessageCard/index.tsx`

```typescript
// Case 1: Assistant Tool Result
{isAssistantToolResultMessage(message) ? (
  (() => {
    // ✅ 检查 display_preference
    if (message.result.display_preference === "Hidden") {
      return null;  // ✅ 不渲染
    }
    
    // ... 原有的 ToolResultCard 渲染逻辑 ...
  })()
) : // ...
```

---

## Phase 4: 前端 UI 优化

### Task 4.1: 显示工具执行状态

#### 文件：`src/hooks/useChatManager.ts`

```typescript
// 添加工具执行状态
const [toolExecutionStatus, setToolExecutionStatus] = useState<{
  isExecuting: boolean;
  toolName?: string;
}>({ isExecuting: false });

// 监听 SSE 事件
case "tool_execution_started":
  setToolExecutionStatus({
    isExecuting: true,
    toolName: event.tool_name,
  });
  break;

case "tool_execution_completed":
  setToolExecutionStatus({ isExecuting: false });
  break;
```

### Task 4.2: 显示 Loading 状态

#### 文件：`src/components/ChatView/index.tsx`

```typescript
{toolExecutionStatus.isExecuting && (
  <div style={{ padding: token.paddingMD }}>
    <Spin tip={`正在执行工具: ${toolExecutionStatus.toolName}...`} />
  </div>
)}
```

---

## 测试计划

### 测试场景 1：单文件引用
- 输入：`@Cargo.toml what's the content?`
- 预期：
  - ✅ 显示 FileReferenceCard（1个文件）
  - ✅ 不显示 ToolResultCard
  - ✅ 显示 AI 流式回复

### 测试场景 2：多文件引用
- 输入：`@Cargo.toml @README.md compare these files`
- 预期：
  - ✅ 显示 FileReferenceCard（2个文件）
  - ✅ 不显示 ToolResultCard
  - ✅ 显示 AI 流式回复

### 测试场景 3：文件夹引用
- 输入：`@src/ what files are in this folder?`
- 预期：
  - ✅ 显示 FileReferenceCard（1个文件夹，带文件夹图标）
  - ✅ 后端调用 `list_directory` 工具
  - ✅ 不显示 ToolResultCard
  - ✅ 显示 AI 流式回复

### 测试场景 4：混合引用
- 输入：`@Cargo.toml @src/ analyze the project structure`
- 预期：
  - ✅ 显示 FileReferenceCard（1个文件 + 1个文件夹）
  - ✅ 后端调用 `read_file` + `list_directory`
  - ✅ 不显示 ToolResultCard
  - ✅ 显示 AI 流式回复

---

## 实现顺序

1. ✅ Phase 1: 前端支持多文件选择
2. ✅ Phase 2: 后端支持多文件和文件夹处理
3. ✅ Phase 3: 工具结果隐藏和 AI 调用
4. ✅ Phase 4: 前端 UI 优化

