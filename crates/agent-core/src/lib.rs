pub mod agent;
pub mod composition;
pub mod storage;
pub mod todo;
pub mod tools;

pub use agent::events::{AgentEvent, TokenUsage};
pub use agent::types::{Message, MessageContent, Role, Session};
pub use agent::AgentError;
pub use storage::{JsonlStorage, Storage};
pub use todo::{TodoItem, TodoItemStatus, TodoList};
pub use tools::{
    execute_tool_call, finalize_tool_calls, handle_tool_result_with_agentic_support,
    parse_tool_args, try_parse_agentic_result, AgenticContext, AgenticTool, AgenticToolResult,
    SmartCodeReviewTool, ToolCall, ToolCallAccumulator, ToolError, ToolExecutor, ToolGoal,
    ToolHandlingOutcome, ToolResult, ToolSchema,
};

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
