# 🚀 GitHub Copilot Chat Desktop 💬

This application brings the power of the GitHub Copilot API to your desktop! 💻 Chat directly with Copilot in a dedicated, native application built with the robust combination of Tauri 🦀, React ⚛️, and TypeScript 🔷. Say goodbye to context switching and hello to focused AI-assisted coding!

## ✨ Features

* 🗣️ **Interactive Chat Interface**: Enjoy a sleek and user-friendly chat window. Send your coding questions, prompts, or ideas to GitHub Copilot and receive insightful responses directly within the app.
* 💅 **Rich Markdown Rendering**: Responses from Copilot are beautifully rendered with Markdown. This means you get well-formatted text, lists, links, and more, making it easy to read and understand.
* 💻 **Crystal-Clear Syntax Highlighting**: Code snippets shared by Copilot (or even your own pasted code) are displayed with accurate syntax highlighting, improving readability and making it easier to review and use the suggested code.
* 🌍 **Truly Cross-Platform**: Thanks to Tauri, this application feels right at home on Windows 🖼️, macOS 🍎, and Linux 🐧.
* ⚡ **(Potential) Global Shortcuts**: We're exploring global keyboard shortcuts (using `tauri-plugin-global-shortcut`) for lightning-fast access to your Copilot chat, no matter what you're doing!

## 🛠️ How to Get Started

Ready to dive in? Here's how you can get the application up and running on your local machine:

1. **Clone the Awesome Repository:** 📂
    First things first, grab a copy of the code!

    ```bash
    git clone <repository-url> # Replace <repository-url> with the actual URL!
    cd copilot_chat
    ```

2. **Install Dependencies:** 📦
    Make sure you have Node.js (with npm or Yarn) and Rust installed on your system. These are the building blocks of our app!

    ```bash
    yarn install # or npm install
    ```

3. **Configure API Access:** 🔑
    * This application needs a GitHub Copilot API token to communicate with the service.
    * You'll likely need to create a `.token` file in the `src-tauri` directory and paste your token there.
    * Alternatively, it might be configurable via an environment variable.
    * _(Developer Note: Please update this section with the precise method for token configuration!)_

4. **Run in Development Mode:** 🚀
    See the magic happen! This command launches the app with live reloading.

    ```bash
    yarn tauri dev # or npm run tauri dev
    ```

5. **Build for Production:** 📦🏭
    Ready to create a distributable version? This command bundles everything up.

    ```bash
    yarn tauri build # or npm run tauri build
    ```

## 🤗 How to Contribute

We love contributions! 🎉 Whether you're a seasoned developer or just starting, there are many ways to help make this project even better.

### 🐞 Reporting Issues & Bugs

Encounter a glitch? Help us squash it!

* First, please peek at the existing [Issues](https://github.com/bigduu/copilot_client_app/issues) to see if someone has already reported it.
* If not, feel free to open a new issue! Please be as detailed as possible:
  * Clear steps to reproduce the bug.
  * What you expected to happen. 🤔
  * What actually happened. 💥
  * Screenshots or GIFs are super helpful! 📸
  * Your operating system and the application version.

### 💡 Suggesting Features & Enhancements

Have a brilliant idea? We're all ears!

* Open a new issue and label it as an "enhancement" or "feature request."
* Describe your idea clearly: What problem does it solve? How would it work? Why would it be awesome?

### 🧑‍💻 Submitting Pull Requests (Code Contributions)

Ready to write some code? Fantastic!

1. **Fork the Repository:** Create your own copy of the project.
2. **Create a New Branch:** `git checkout -b feature/your-amazing-feature` or `git checkout -b fix/annoying-bug-fix`. Meaningful branch names are a plus!
3. **Code Away!** Make your changes, improvements, or fixes.
4. **Follow Coding Standards:** If there are defined coding styles or linters, please adhere to them. (We'll add these if they don't exist yet!)
5. **Write Great Commit Messages:** Clear, concise, and descriptive. Prefix with type (e.g., `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`).
6. **Push to Your Fork:** `git push origin feature/your-amazing-feature`.
7. **Open a Pull Request:** Target the `main` (or `master`) branch of the original repository.
8. **Describe Your PR:** Clearly explain the "what" and "why" of your changes. Link to any relevant issues.

We'll do our best to review your contribution promptly and provide constructive feedback. Thank you for helping out! 🙏

## 📚 项目文档

本项目包含完整的技术文档，按类别组织在 `docs/` 目录下：

### 📖 文档结构

- **[开发指南](./docs/development/)** - 代码规范和开发最佳实践
  - [样式指南](./docs/development/STYLING_GUIDELINES.md) - 代码格式和样式规范
  - [组件文档](./docs/development/components/) - 前端组件使用指南
    - [SystemPromptSelector](./docs/development/components/SystemPromptSelector.md) - 系统提示选择器组件

- **[架构设计](./docs/architecture/)** - 系统架构和设计文档
  - [工具系统开发者指南](./docs/architecture/tools-system.md) - Category trait 架构和开发接口
  - [工具调用流程改进](./docs/architecture/IMPROVED_TOOL_CALL_FLOW.md) - 工具调用优化方案
  - [Mermaid 功能增强](./docs/architecture/MERMAID_ENHANCEMENT.md) - 图表功能扩展
  - [系统提示优化计划](./docs/architecture/SYSTEM_PROMPT_ENHANCEMENT_PLAN.md) - AI 提示改进
  - [工具架构迁移指南](./docs/architecture/TOOL_ARCHITECTURE_MIGRATION_GUIDE.md) - 架构升级指导

- **[项目报告](./docs/reports/)** - 重构和修复报告
  - [实施报告](./docs/reports/implementation/) - 具体实施过程记录
    - [项目重构总结](./docs/reports/implementation/PROJECT_REFACTORING_SUMMARY_REPORT.md)
    - [严格模式实施](./docs/reports/implementation/STRICT_MODE_IMPLEMENTATION.md)
    - [硬编码清理报告](./docs/reports/implementation/HARDCODE_CLEANUP_REPORT.md)
    - [其他修复报告](./docs/reports/implementation/)

- **[测试文档](./docs/testing/)** - 测试策略和结果
  - [测试分类](./docs/testing/test_categories.md) - 测试规范和分类
  - [工具调用测试](./docs/testing/TOOL_CALL_TEST_RESULTS.md) - 测试结果分析
  - [重构测试报告](./docs/testing/TOOL_CALL_REFACTOR_TEST.md) - 重构验证

- **[工具文档](./docs/tools/)** - 工具配置和使用指南
  - [Mermaid 示例](./docs/tools/MERMAID_EXAMPLES.md) - 图表使用示例
  - [工具迁移指南](./docs/tools/TOOL_MIGRATION_GUIDE.md) - 工具升级指导
  - [配置重构计划](./docs/tools/TOOLS_CONFIG_REFACTOR_PLAN.md) - 配置优化方案

### 📋 文档使用建议

- **新开发人员**: 建议从 [开发指南](./docs/development/) 开始阅读
- **架构了解**: 查看 [架构设计](./docs/architecture/) 文档了解系统设计
- **问题排查**: 参考 [测试文档](./docs/testing/) 和 [项目报告](./docs/reports/)
- **工具使用**: 查阅 [工具文档](./docs/tools/) 获取详细使用说明

## 🔧 Recommended IDE Setup

For the best development experience, we recommend:

* [VS Code](https://code.visualstudio.com/) 🟦 - A fantastic and popular code editor.
* [Tauri Plugin for VS Code](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 🦀 - Essential for Tauri development.
* [rust-analyzer Plugin for VS Code](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) ⚙️ - Supercharges your Rust development experience.

---
Happy Coding! 🎉
hello world by OPENCHAT
