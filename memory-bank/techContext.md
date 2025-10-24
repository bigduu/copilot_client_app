# 技术背景

## 技术栈

- **前端**:
  - **框架**: React
  - **语言**: TypeScript
  - **构建工具**: Vite
  - **状态管理**: Zustand
  - **UI组件**: Ant Design
  - **核心依赖**: `xstate` (状态机), `react-markdown` (Markdown渲染), `mermaid` (图表)

- **后端/桌面**:
  - **框架**: Tauri
  - **语言**: Rust
  - **Web服务**: actix-web
  - **核心依赖**: `serde` (序列化), `tokio` (异步运行时), `thiserror` (错误处理)

- **依赖管理**:
  - **前端**: `yarn`
  - **后端**: `cargo`

## 开发环境

- **IDE**: Visual Studio Code
- **操作系统**: 跨平台（macOS, Windows, Linux），但当前环境为 macOS。
- **Shell**: fish

## 技术约束

- **性能**: 作为桌面应用，必须保持响应迅速和低资源占用。
- **安全性**: 由于应用可以访问文件系统和执行命令，所有危险操作都必须经过用户批准。Rust的内存安全特性是选择它的一个关键原因。
- **模块化**: 代码库必须保持高度模块化，以便于维护和扩展。`crates` 用于组织后端逻辑，`src/components`, `src/services`, `src/hooks` 等用于组织前端代码。
