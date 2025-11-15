# Phase 2.0: Message Processing Pipeline 规划文档

**创建日期**: 2025-11-08  
**状态**: 📋 规划中  
**预计工期**: 3-4 天  
**前置条件**: Phase 1.5 完成 ✅

---

## 🎯 Phase 2.0 目标

### 核心目标

实现**统一的消息处理 Pipeline**，将当前分散在各处的消息处理逻辑（验证、文件引用解析、工具增强、System Prompt 动态生成等）集中到一个可扩展的 pipeline 架构中。

### 为什么需要 Pipeline？

**当前问题**：
1. **逻辑分散**: 消息验证、文件读取、工具注入等逻辑散落在 `chat_service.rs`、`context_lifecycle.rs` 等多个文件
2. **难以扩展**: 每次添加新的消息处理逻辑都需要修改多处代码
3. **测试困难**: 无法独立测试每个处理步骤
4. **职责不清**: 处理逻辑和业务逻辑耦合在一起

**Pipeline 解决方案**：
```
用户消息 → [Validation] → [FileReference] → [ToolEnhancement] → [SystemPrompt] → LLM
           ↓              ↓                  ↓                    ↓
         验证失败?      解析文件引用        注入工具定义        动态 Prompt
```

---

## 🏗️ 架构设计

### 核心组件

#### 1. MessageProcessor Trait

```rust
/// 消息处理器 Trait - 所有处理器都实现这个接口
pub trait MessageProcessor: Send + Sync {
    /// 处理器名称（用于日志和调试）
    fn name(&self) -> &str;
    
    /// 处理消息
    /// 
    /// - 输入: ProcessingContext（包含 message, context, config 等）
    /// - 输出: ProcessResult（Continue/Abort/Transform）
    fn process(
        &self, 
        ctx: &mut ProcessingContext
    ) -> Result<ProcessResult, ProcessError>;
    
    /// 是否需要执行（可选，用于条件执行）
    fn should_run(&self, ctx: &ProcessingContext) -> bool {
        true
    }
}
```

#### 2. MessagePipeline 结构

```rust
/// 消息处理 Pipeline
pub struct MessagePipeline {
    /// 处理器列表（按顺序执行）
    processors: Vec<Box<dyn MessageProcessor>>,
    
    /// Pipeline 配置
    config: PipelineConfig,
}

impl MessagePipeline {
    /// 创建新的 Pipeline
    pub fn new() -> Self;
    
    /// 注册处理器
    pub fn register(mut self, processor: Box<dyn MessageProcessor>) -> Self;
    
    /// 执行 Pipeline
    pub async fn execute(
        &self,
        message: InternalMessage,
        context: &mut ChatContext,
    ) -> Result<PipelineOutput, PipelineError>;
}
```

#### 3. ProcessingContext

```rust
/// 处理上下文 - 在 Pipeline 中传递
pub struct ProcessingContext {
    /// 当前处理的消息
    pub message: InternalMessage,
    
    /// 对话上下文（可修改）
    pub chat_context: &mut ChatContext,
    
    /// 处理过程中的临时数据
    pub metadata: HashMap<String, Value>,
    
    /// 文件引用解析结果
    pub file_contents: Vec<FileContent>,
    
    /// 工具定义
    pub available_tools: Vec<ToolDefinition>,
    
    /// System Prompt 片段
    pub prompt_fragments: Vec<String>,
    
    /// 处理统计
    pub stats: ProcessingStats,
}
```

#### 4. ProcessResult

```rust
/// 处理结果
#[derive(Debug)]
pub enum ProcessResult {
    /// 继续执行下一个处理器
    Continue,
    
    /// 修改消息后继续
    Transform(InternalMessage),
    
    /// 终止 Pipeline（通常用于验证失败）
    Abort { reason: String },
    
    /// 需要异步操作（如用户审批）
    Suspend { 
        resume_token: String,
        reason: String,
    },
}
```

---

## 📦 实现的处理器

### 1. ValidationProcessor

**职责**: 验证消息的有效性

**验证项**:
- 消息内容不为空
- 必填字段完整
- 消息类型合法
- 角色权限检查

**输出**:
- `Continue`: 验证通过
- `Abort`: 验证失败，返回错误信息

---

### 2. FileReferenceProcessor

**职责**: 解析和读取文件引用

**处理逻辑**:
1. 检测消息中的文件引用（`@file.rs`, `@file.rs:10-20`）
2. 读取文件内容
3. 将内容添加到 `ProcessingContext.file_contents`
4. 可选：生成文件摘要（用于 token 优化）

**输出**:
- `Continue`: 文件读取成功
- `Abort`: 文件不存在或无权限

**配置项**:
```rust
pub struct FileReferenceConfig {
    /// 最大文件大小（字节）
    pub max_file_size: usize,
    
    /// 支持的文件类型
    pub allowed_extensions: Vec<String>,
    
    /// 是否生成摘要
    pub generate_summary: bool,
}
```

---

### 3. ToolEnhancementProcessor

**职责**: 注入可用工具定义到 System Prompt

**处理逻辑**:
1. 根据当前模式（Plan/Act）获取可用工具列表
2. 生成工具定义的 Markdown 格式
3. 添加到 `ProcessingContext.prompt_fragments`

**输出**:
- `Continue`: 工具定义已添加

**生成格式**:
```markdown
## Available Tools

### read_file
Read content from a file.
- **Parameters**: 
  - path (string, required): File path
  - line_range (string, optional): Line range (e.g., "10-20")
- **Returns**: File content as string

### execute_command
Execute a shell command.
...
```

---

### 4. SystemPromptProcessor

**职责**: 动态生成最终的 System Prompt

**处理逻辑**:
1. 获取基础 System Prompt（从 context.config）
2. 根据模式（Plan/Act）添加角色指令
3. 合并 `ProcessingContext.prompt_fragments`
4. 添加上下文提示（如分支信息）
5. 更新到 `ChatContext` 的当前 System Prompt

**输出**:
- `Continue`: System Prompt 已更新

**生成结构**:
```
[基础 System Prompt]

[模式特定指令 - Plan/Act]

[工具定义]

[文件上下文摘要]

[分支/状态提示]
```

---

## 📝 实施计划

### 2.1 定义核心 Trait 和结构 (1 天)

**任务**:
- [x] 2.1.1 创建 `crates/context_manager/src/pipeline/mod.rs`
- [ ] 2.1.2 定义 `MessageProcessor` trait
- [ ] 2.1.3 定义 `ProcessingContext` 结构
- [ ] 2.1.4 定义 `ProcessResult` 枚举
- [ ] 2.1.5 定义 `ProcessError` 和 `PipelineError`
- [ ] 2.1.6 编写基础单元测试

**文件结构**:
```
crates/context_manager/src/
└── pipeline/
    ├── mod.rs              # 导出所有模块
    ├── traits.rs           # MessageProcessor trait
    ├── context.rs          # ProcessingContext
    ├── result.rs           # ProcessResult, ProcessError
    └── tests/
        └── traits_test.rs  # Trait 测试
```

---

### 2.2 实现 MessagePipeline (1 天)

**任务**:
- [ ] 2.2.1 实现 `MessagePipeline` 结构
- [ ] 2.2.2 实现 `register()` 方法（支持链式调用）
- [ ] 2.2.3 实现 `execute()` 方法（按序执行处理器）
- [ ] 2.2.4 实现错误处理和回滚机制
- [ ] 2.2.5 实现处理统计收集
- [ ] 2.2.6 编写 Pipeline 集成测试

**核心逻辑**:
```rust
pub async fn execute(
    &self,
    mut message: InternalMessage,
    context: &mut ChatContext,
) -> Result<PipelineOutput, PipelineError> {
    let mut ctx = ProcessingContext::new(message, context);
    
    for processor in &self.processors {
        // 检查是否需要执行
        if !processor.should_run(&ctx) {
            continue;
        }
        
        // 执行处理器
        let result = processor.process(&mut ctx)?;
        
        // 处理结果
        match result {
            ProcessResult::Continue => continue,
            ProcessResult::Transform(new_msg) => {
                ctx.message = new_msg;
            }
            ProcessResult::Abort { reason } => {
                return Err(PipelineError::Aborted(reason));
            }
            ProcessResult::Suspend { .. } => {
                return Ok(PipelineOutput::Suspended(..));
            }
        }
    }
    
    Ok(PipelineOutput::Completed {
        message: ctx.message,
        metadata: ctx.metadata,
    })
}
```

**文件**:
- `pipeline/pipeline.rs`
- `pipeline/tests/pipeline_test.rs`

---

### 2.3 实现基础处理器 (1.5 天)

#### 2.3.1 ValidationProcessor

**任务**:
- [ ] 实现 `ValidationProcessor` 结构
- [ ] 实现基础验证规则
- [ ] 添加可配置的验证规则
- [ ] 编写测试

**文件**: `pipeline/processors/validation.rs`

---

#### 2.3.2 FileReferenceProcessor

**任务**:
- [ ] 实现文件引用检测（正则表达式）
- [ ] 实现文件读取逻辑
- [ ] 添加权限和大小检查
- [ ] 支持行范围解析（`:10-20`）
- [ ] 编写测试

**文件**: `pipeline/processors/file_reference.rs`

**正则表达式**:
```rust
// 匹配 @file.rs 或 @file.rs:10-20
let file_ref_pattern = r"@([a-zA-Z0-9_/\.\-]+)(?::(\d+)-(\d+))?";
```

---

#### 2.3.3 ToolEnhancementProcessor

**任务**:
- [ ] 从 `tool_system` 获取工具列表
- [ ] 生成 Markdown 格式工具定义
- [ ] 根据模式过滤工具
- [ ] 编写测试

**文件**: `pipeline/processors/tool_enhancement.rs`

---

#### 2.3.4 SystemPromptProcessor

**任务**:
- [ ] 实现 Prompt 片段合并
- [ ] 实现模式特定指令
- [ ] 添加上下文提示
- [ ] 编写测试

**文件**: `pipeline/processors/system_prompt.rs`

**文件结构**:
```
pipeline/
├── processors/
│   ├── mod.rs
│   ├── validation.rs
│   ├── file_reference.rs
│   ├── tool_enhancement.rs
│   └── system_prompt.rs
└── tests/
    └── processors_test.rs
```

---

### 2.4 Pipeline 集成到 ChatContext (0.5 天)

**任务**:
- [ ] 在 `ChatContext` 添加 `pipeline` 字段
- [ ] 实现默认 Pipeline 配置
- [ ] 更新 `send_message` 方法使用 Pipeline
- [ ] 更新相关测试

**集成方式**:
```rust
impl ChatContext {
    pub fn new(...) -> Self {
        let pipeline = MessagePipeline::new()
            .register(Box::new(ValidationProcessor::new()))
            .register(Box::new(FileReferenceProcessor::new()))
            .register(Box::new(ToolEnhancementProcessor::new()))
            .register(Box::new(SystemPromptProcessor::new()));
        
        Self {
            pipeline,
            // ...
        }
    }
    
    pub async fn process_incoming_message(
        &mut self,
        message: InternalMessage,
    ) -> Result<(), ContextError> {
        let output = self.pipeline.execute(message, self).await?;
        
        match output {
            PipelineOutput::Completed { message, .. } => {
                self.add_message(message);
                Ok(())
            }
            PipelineOutput::Suspended { .. } => {
                // 处理需要审批的情况
                Ok(())
            }
        }
    }
}
```

---

### 2.5 测试和文档 (0.5 天)

**任务**:
- [ ] 编写端到端集成测试
- [ ] 性能测试（Pipeline 开销）
- [ ] 更新 API 文档
- [ ] 创建使用示例
- [ ] 更新 OpenSpec spec delta

**测试场景**:
1. 简单文本消息（只经过 Validation）
2. 带文件引用的消息
3. 需要工具增强的消息
4. Pipeline 中途失败（验证失败）
5. 自定义 Processor 注册

---

## 🧪 测试策略

### 单元测试

每个 Processor 独立测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validation_processor_valid_message() {
        let processor = ValidationProcessor::new();
        let mut ctx = create_test_context();
        
        let result = processor.process(&mut ctx).unwrap();
        assert!(matches!(result, ProcessResult::Continue));
    }
    
    #[test]
    fn test_validation_processor_empty_content() {
        let processor = ValidationProcessor::new();
        let mut ctx = create_test_context_with_empty_message();
        
        let result = processor.process(&mut ctx).unwrap();
        assert!(matches!(result, ProcessResult::Abort { .. }));
    }
}
```

---

### 集成测试

完整 Pipeline 测试：

```rust
#[tokio::test]
async fn test_pipeline_with_file_reference() {
    let pipeline = MessagePipeline::new()
        .register(Box::new(ValidationProcessor::new()))
        .register(Box::new(FileReferenceProcessor::new()));
    
    let message = InternalMessage {
        content: Some("Check @src/main.rs".to_string()),
        // ...
    };
    
    let mut context = ChatContext::new(...);
    let output = pipeline.execute(message, &mut context).await.unwrap();
    
    match output {
        PipelineOutput::Completed { metadata, .. } => {
            assert!(metadata.contains_key("file_contents"));
        }
        _ => panic!("Expected completed output"),
    }
}
```

---

## 📊 性能考虑

### Pipeline 开销

**目标**: Pipeline 处理时间 < 50ms (不包括文件 I/O)

**优化策略**:
1. **并行处理**: 如果处理器之间无依赖，可以并行执行
2. **缓存**: 文件内容、工具定义等可以缓存
3. **懒加载**: 只有需要时才读取文件
4. **条件执行**: 通过 `should_run()` 跳过不必要的处理器

---

### 内存优化

**考虑**:
- 大文件引用：使用流式读取，而非一次性加载
- 工具定义：生成一次，缓存结果
- Prompt 片段：使用 `Cow<str>` 避免不必要的克隆

---

## 🔄 与现有代码的集成

### 迁移路径

1. **Phase 2.0**: 实现 Pipeline，与现有代码并行
2. **Phase 2.1**: 逐步迁移现有逻辑到 Pipeline
3. **Phase 2.2**: 移除旧的处理逻辑

### 向后兼容

- Pipeline 作为可选功能，默认启用
- 提供 Feature Flag 切换旧/新实现
- 现有 API 不变，内部实现改为使用 Pipeline

---

## 📈 成功指标

### 功能完整性
- [ ] 所有基础 Processor 实现并测试
- [ ] Pipeline 集成到 ChatContext
- [ ] 所有测试通过（单元 + 集成）

### 代码质量
- [ ] 测试覆盖率 > 85%
- [ ] 无编译警告
- [ ] Clippy 无严重问题
- [ ] 文档完整（所有公开 API）

### 性能
- [ ] Pipeline 开销 < 50ms
- [ ] 文件读取优化（缓存）
- [ ] 内存使用合理

### 可扩展性
- [ ] 新增 Processor 无需修改核心代码
- [ ] 支持自定义 Processor
- [ ] 支持 Processor 条件执行

---

## 🎓 设计原则

### 1. 单一职责

每个 Processor 只做一件事：
- ValidationProcessor: 只验证
- FileReferenceProcessor: 只读文件
- 不混合多个职责

### 2. 开闭原则

- 对扩展开放：可以轻松添加新 Processor
- 对修改关闭：添加 Processor 不需要修改 Pipeline 核心代码

### 3. 依赖注入

- Processor 不直接依赖具体实现
- 通过 `ProcessingContext` 传递依赖
- 便于测试和模拟

### 4. 错误处理

- 每个 Processor 的错误清晰描述
- Pipeline 能够定位失败的 Processor
- 提供详细的错误上下文

---

## 🔮 未来扩展

### Phase 2.1 可能的 Processor

1. **ContextOptimizationProcessor**
   - Token 计数
   - 消息压缩
   - 智能摘要

2. **SecurityProcessor**
   - 敏感信息检测
   - 权限检查
   - 内容过滤

3. **AnalyticsProcessor**
   - 使用统计
   - 性能追踪
   - 日志记录

4. **CacheProcessor**
   - 检查缓存
   - 避免重复计算

5. **ImageProcessingProcessor**
   - 图片压缩
   - OCR 识别
   - Vision API 集成

---

## 📚 参考资料

### 类似实现

- **Express.js Middleware**: 链式处理请求
- **ASP.NET Core Pipeline**: 请求处理管道
- **Tokio Tower**: Service 和 Layer 抽象

### Rust 设计模式

- **Chain of Responsibility**: Pipeline 本质
- **Strategy Pattern**: 可插拔的 Processor
- **Builder Pattern**: Pipeline 构建

---

## ✅ 准备开始实施

### 前置检查

- [x] Phase 1.5 完成
- [x] 理解 proposal.md 和 design.md
- [x] 规划文档创建完成
- [ ] 与团队讨论和确认

### 下一步

**准备好开始实施了吗？**

如果准备好，我将：
1. 创建 `pipeline/` 目录结构
2. 定义核心 Trait 和结构
3. 开始实现第一个 Processor

---

**状态**: 📋 **规划完成，等待确认开始实施**  
**预计完成时间**: 3-4 天  
**风险**: 🔵 低 - 架构清晰，技术可行

**🚀 准备好了就告诉我，我们开始 Phase 2.0 的实施！**

