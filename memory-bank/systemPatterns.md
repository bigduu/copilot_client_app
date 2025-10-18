# 系统模式

## 架构概述

本应用采用前后端分离的架构，并通过Tauri进行打包。

- **前端 (React/TypeScript)**: 负责所有用户界面和客户端状态管理。它通过Tauri的JS-Rust互操作桥与后端通信。
- **后端 (Rust/Tauri)**: 处理核心业务逻辑，包括：
  - 与大语言模型 (LLM) 的API交互。
  - 管理和执行工具（文件操作、CLI命令等）。
  - 处理系统级事件和通知。

## 关键设计模式

- **服务工厂 (`ServiceFactory`)**: 在前端，`ServiceFactory` 用于根据当前模式（例如Tauri模式或Web模式）动态提供服务实现。这使得核心业务逻辑与具体实现分离。
- **状态机 (`chatInteractionMachine`)**: 使用XState管理聊天交互的复杂状态，如空闲、等待AI响应、等待用户批准等。这使得UI状态的管理更加可预测和健壮。
- **命令模式**: 后端的Tauri命令（`#[tauri::command]`）将前端请求封装为独立的、可执行的操作。
- **模块化 (`crates`)**: Rust后端被分解为多个`crates`（如 `copilot_client`, `tool_system`），每个`crate`负责一个特定的功能领域，遵循单一职责原则。

## 组件关系

- **`ChatView`**: 核心UI组件，展示聊天消息。
- **`MessageInput`**: 用户输入框，处理文本和附件。
- **`ChatControllerContext`**: React Context，为整个应用提供对聊天管理器的访问。
- **`useChatManager`**: 自定义Hook，封装了与聊天交互状态机和后端服务通信的主要逻辑。
- **`TauriService`**: 封装了所有与Tauri后端通信的细节。
