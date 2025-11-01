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

## 🚨 Important: Data Migration Notice

**Version 2.0+** introduces a major architectural change: chat context is now managed by the backend instead of browser LocalStorage.

### First Launch After Upgrade
1. A **migration banner** will appear if you have existing chat data
2. Click **"Migrate now"** to transfer your chats, messages, and system prompts to the backend
3. The migration includes automatic validation and creates a backup for safety
4. If something goes wrong, use **"Rollback from backup"** to restore your data

See [Context Manager Migration Guide](./docs/architecture/context-manager-migration.md) for details.

## 📚 Project Documentation

This project contains comprehensive technical documentation, organized by category in the `docs/` directory:

### 📖 Documentation Structure

- **[Development Guide](./docs/development/)** - Code standards and development best practices
  - [Style Guide](./docs/development/STYLING_GUIDELINES.md) - Code formatting and style standards
  - [Component Documentation](./docs/development/components/) - Frontend component usage guide
    - [SystemPromptSelector](./docs/development/components/SystemPromptSelector.md) - System prompt selector component

- **[Architecture Design](./docs/architecture/)** - System architecture and design documentation
  - [Context Manager Migration](./docs/architecture/context-manager-migration.md) - **NEW**: Backend context architecture
  - [Tool System Developer Guide](./docs/architecture/tools-system.md) - Category trait architecture and development interface
  - [Tool Call Flow Improvement](./docs/architecture/IMPROVED_TOOL_CALL_FLOW.md) - Tool call optimization solution
  - [Mermaid Feature Enhancement](./docs/architecture/MERMAID_ENHANCEMENT.md) - Chart functionality extension
  - [System Prompt Enhancement Plan](./docs/architecture/SYSTEM_PROMPT_ENHANCEMENT_PLAN.md) - AI prompt improvement
  - [Tool Architecture Migration Guide](./docs/architecture/TOOL_ARCHITECTURE_MIGRATION_GUIDE.md) - Architecture upgrade guidance

- **[Project Reports](./docs/reports/)** - Refactoring and fix reports
  - [Implementation Reports](./docs/reports/implementation/) - Specific implementation process records
    - [Project Refactoring Summary](./docs/reports/implementation/PROJECT_REFACTORING_SUMMARY_REPORT.md)
    - [Strict Mode Implementation](./docs/reports/implementation/STRICT_MODE_IMPLEMENTATION.md)
    - [Hardcode Cleanup Report](./docs/reports/implementation/HARDCODE_CLEANUP_REPORT.md)
    - [Other Fix Reports](./docs/reports/implementation/)

- **[Testing Documentation](./docs/testing/)** - Testing strategies and results
  - [Test Categories](./docs/testing/test_categories.md) - Testing standards and classification
  - [Tool Call Testing](./docs/testing/TOOL_CALL_TEST_RESULTS.md) - Test result analysis
  - [Refactoring Test Report](./docs/testing/TOOL_CALL_REFACTOR_TEST.md) - Refactoring verification

- **[Tool Documentation](./docs/tools/)** - Tool configuration and usage guide
  - [Mermaid Examples](./docs/tools/MERMAID_EXAMPLES.md) - Chart usage examples
  - [Tool Migration Guide](./docs/tools/TOOL_MIGRATION_GUIDE.md) - Tool upgrade guidance
  - [Configuration Refactoring Plan](./docs/tools/TOOLS_CONFIG_REFACTOR_PLAN.md) - Configuration optimization solution

### 📋 Documentation Usage Recommendations

- **New Developers**: Recommended to start reading from [Development Guide](./docs/development/)
- **Architecture Understanding**: Check [Architecture Design](./docs/architecture/) documentation to understand system design
- **Problem Troubleshooting**: Refer to [Testing Documentation](./docs/testing/) and [Project Reports](./docs/reports/)
- **Tool Usage**: Consult [Tool Documentation](./docs/tools/) for detailed usage instructions

## 🔧 Recommended IDE Setup

For the best development experience, we recommend:

* [VS Code](https://code.visualstudio.com/) 🟦 - A fantastic and popular code editor.
* [Tauri Plugin for VS Code](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 🦀 - Essential for Tauri development.
* [rust-analyzer Plugin for VS Code](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) ⚙️ - Supercharges your Rust development experience.

---
Happy Coding! 🎉
hello world by OPENCHAT
