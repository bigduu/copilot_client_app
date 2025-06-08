/**
 * Mermaid 相关的工具函数
 */

const MERMAID_ENHANCEMENT_KEY = "mermaid_enhancement_enabled";

/**
 * 检查 Mermaid 增强功能是否启用
 */
export const isMermaidEnhancementEnabled = (): boolean => {
  return localStorage.getItem(MERMAID_ENHANCEMENT_KEY) !== "false";
};

/**
 * 启用/禁用 Mermaid 增强功能
 */
export const setMermaidEnhancementEnabled = (enabled: boolean): void => {
  localStorage.setItem(MERMAID_ENHANCEMENT_KEY, enabled.toString());
};

/**
 * 获取 Mermaid 增强提示词
 */
export const getMermaidEnhancementPrompt = (): string => {
  return `

## 📊 Visual Representation Guidelines

When explaining concepts, processes, relationships, or data structures, ALWAYS consider using Mermaid diagrams to enhance understanding. Use the following diagram types:

### Flowcharts - For processes, workflows, decision trees
\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

### Sequence Diagrams - For interactions, API calls, communication flows
\`\`\`mermaid
sequenceDiagram
    participant User
    participant System
    User->>System: Request
    System-->>User: Response
\`\`\`

### Class Diagrams - For object relationships, data models
\`\`\`mermaid
classDiagram
    class User {
        +String name
        +String email
        +login()
    }
    User --> Role
\`\`\`

### State Diagrams - For state machines, status flows
\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing
    Processing --> Complete
    Complete --> [*]
\`\`\`

### Gantt Charts - For project timelines, schedules
\`\`\`mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1: 2024-01-01, 30d
    Task 2: after task1, 20d
\`\`\`

### Entity Relationship Diagrams - For database schemas
\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
\`\`\`

### Git Graphs - For version control workflows
\`\`\`mermaid
gitgraph
    commit
    branch feature
    checkout feature
    commit
    checkout main
    merge feature
\`\`\`

**IMPORTANT**: When discussing any concept that can be visualized (architecture, workflows, data flow, relationships, hierarchies, timelines, etc.), include a relevant Mermaid diagram to make the explanation clearer and more engaging.`;
};
