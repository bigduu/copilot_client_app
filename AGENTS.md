<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# System Prompt 实时更新 Bug 修复归档

本文档记录了对“自定义 System Prompt 未实时生效”问题的完整调查和修复过程。

## 1. 初始问题报告

用户报告，在前端通过 CRUD 创建并选择了一个自定义的 `system prompt` 后，新建对话并发起请求时，`prompt` 的自定义内容部分没有生效。只有工具调用、`diagram` 拼接等由系统动态添加的部分有效。

## 2. 第一轮调查与修复

*   **调查**: 委派 "Code" 模式分析 `system prompt` 的创建和使用流程。
*   **发现**: 分析发现在 `src/hooks/useChatManager.ts` 中的 `createNewChat` 函数，在创建新聊天时，总是使用一个硬编码的默认 `system prompt`，忽略了用户的选择。
*   **修复**: 修改了 `createNewChat` 函数，使其在创建新聊天时，能够从全局状态中读取并保存用户最后选择的 `prompt` ID 和内容到新聊天的配置中。

## 3. 问题复现与第二轮调查

*   **用户反馈**: 初步修复后，用户反馈问题依旧存在。虽然新聊天 *保存* 了正确的 `prompt`，但在 *发送消息* 时，自定义内容仍然丢失。
*   **新假设**: 问题根源不在于聊天的创建，而在于消息发送前，`system prompt` 被“增强”或“拼接”的环节。
*   **深入调查**: 委派 "Code" 模式深入分析 `SystemPromptEnhancer` 服务 (`src/services/SystemPromptEnhancer.ts`) 和状态机 (`src/core/chatInteractionMachine.ts`)。

## 4. 根本原因定位

*   **发现**: "Code" 模式的第二轮分析报告指出，问题的根本原因在 `src/core/chatInteractionMachine.ts` 的 `enhanceSystemPrompt` actor 中。
*   **根本原因**: 该 actor 在准备最终 `system prompt` 时，其基础 `prompt` (`baseSystemPrompt`) 的来源是 `input.chat.config.baseSystemPrompt`。这个值是在**聊天创建时**就已固化，并不会随着用户在聊天界面中切换 `prompt` 而更新。因此，系统总是使用一个陈旧的 `prompt` 版本去拼接工具等信息，导致用户的实时修改无效。

## 5. 最终解决方案与实施

*   **解决方案**: 修改 `enhanceSystemPrompt` actor 的逻辑，使其不再依赖陈旧的 `chat.config.baseSystemPrompt`。
*   **实施**: 委派 "Code" 模式进行最终修复。
    1.  在 `enhanceSystemPrompt` actor 内部，首先从 `input.chat.config` 获取当前聊天关联的 `systemPromptId`。
    2.  使用这个 `ID` 从 `input.systemPrompts` 数组（包含了所有最新的 `prompt` 列表）中实时查找对应的 `prompt` 对象。
    3.  使用这个最新 `prompt` 对象的 `content` 作为 `basePrompt`。
    4.  设置回退机制：如果找不到匹配的 `prompt`，则依次降级使用 `input.chat.config.baseSystemPrompt` 或空字符串，保证健壮性。

## 结论

通过两轮深入的调查和修复，问题被彻底解决。现在，系统能够在每次发送消息时，都实时获取并应用用户为当前聊天选择的最新 `system prompt`，确保了功能的正确性和一致性。