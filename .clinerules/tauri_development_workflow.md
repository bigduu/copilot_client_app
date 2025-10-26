### **Cline Rule: Tauri Development Workflow and Cross-Stack Compliance**

**Rule Filename:** `tauri_development_workflow.md`

**Objective (目标):**
All development work within this project, which utilizes the Tauri framework (Rust backend, React/TypeScript frontend), **MUST** adhere to best practices for cross-stack development, process management, and component architecture.

---

### **1. Development Process and Monitoring (开发流程与监控)**

| Rule | Requirement | Rationale |
| :--- | :--- | :--- |
| **1.1 Local Testing Command** | The local development environment **MUST** be initiated using the command `yarn tauri dev`. | Standard project practice. |
| **1.2 Real-time Log Monitoring** | Since `tauri dev` auto-compiles, for continuous monitoring, you **MUST** find the relevant log file (if redirected) or process output and use `tail -f &lt;log_file>` to track runtime status, compilation errors, and application output. | Avoids repetitive restarts and ensures immediate feedback. |
| **1.3 Process Management** | If the `tauri dev` process needs to be restarted or is running in the background, you **MUST** use appropriate shell commands (e.g., `pgrep tauri`, `kill`) to manage or terminate the process cleanly. | Ensures reliable process state before new actions. |
| **1.4 Background Logging (Optional)** | When running tests or processes in a non-interactive shell context, you **MAY** use `nohup &lt;command> > &lt;log_file> 2>&amp;1 &amp;` to redirect output to a file, immediately followed by `tail -f &lt;log_file>` for monitoring. | Maintains history and allows background execution tracking. |

---

### **2. Cross-Stack Compatibility and Boundary (跨栈兼容性与边界)**

| Rule | Requirement | Rationale |
| :--- | :--- | :--- |
| **2.1 Data Compatibility Check** | After modifying any data structure in the **Rust backend**, you **MUST** immediately check for **data compatibility issues** in the TypeScript/React frontend (i.e., ensure the frontend types, component props, or state handling can correctly consume the new payload). | Prevents runtime breakage across the FFI (Foreign Function Interface) boundary. |
| **2.2 API Naming and Structure** | Rust commands exposed to the frontend **MUST** use clear, descriptive names. The structure should be consistent (e.g., function names should be `camelCase` to align with JavaScript conventions). | Improves cross-language readability and integration. |
| **2.3 Error Propagation** | All Rust commands that can fail **MUST** propagate errors back to the frontend using the standard Tauri error pattern. The frontend (TS/React) **MUST** include dedicated UI logic to handle and display these errors gracefully. | Ensures a reliable user experience and aids debugging. |
| **2.4 Type Safety** | You **MUST** ensure that the TypeScript types defined in the frontend correctly reflect the expected structure of data received from the Rust backend, maximizing type safety. | Leverages TypeScript for robust, bug-free data handling. |

---

### **3. Code Standards (代码规范)**

| Rule | Requirement | Rationale |
| :--- | :--- | :--- |
| **3.1 Backend (Rust)** | Rust code **MUST** prioritize idiomatic Rust practices, including **ownership and borrowing safety**, clear error handling (using `Result`), and efficient data structures. | Ensures performance and reliability. |
| **3.2 Frontend (React/TS)** | Frontend code **MUST** adhere to modern web development design patterns (e.g., functional components, Hooks), separation of concerns, and the code quality rules defined in `code_quality_standards.md`. | Maintains high component quality and modularity. |
| **3.3 UI Framework Compliance** | When generating or modifying UI components, you **MUST** use and follow the specific guidelines and component APIs of the designated frontend UI framework (e.g., Material UI, Ant Design, Tailwind CSS classes, etc.). | Ensures visual consistency and correct framework usage. |

**Final Directive (最终指示):**

Before finalizing any commit, you **MUST** confirm that the changes have been tested using the process defined in Section 1 and that the cross-stack compatibility checks in Section 2 have been performed.
