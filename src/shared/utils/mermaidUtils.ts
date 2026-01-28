/**
 * Mermaid related utility functions
 */

const MERMAID_ENHANCEMENT_KEY = "mermaid_enhancement_enabled";

/**
 * Check if Mermaid enhancement feature is enabled
 */
export const isMermaidEnhancementEnabled = (): boolean => {
  return localStorage.getItem(MERMAID_ENHANCEMENT_KEY) !== "false";
};

/**
 * Enable/disable Mermaid enhancement feature
 */
export const setMermaidEnhancementEnabled = (enabled: boolean): void => {
  localStorage.setItem(MERMAID_ENHANCEMENT_KEY, enabled.toString());
};

/**
 * Get Mermaid enhancement prompt
 */
export const getMermaidEnhancementPrompt = (): string => {
  return `

## 📊 Visual Representation Guidelines

When explaining concepts, processes, relationships, or data structures, ALWAYS consider using Mermaid diagrams to enhance understanding. Use the following diagram types:

### Flowcharts - For processes, workflows, decision trees
\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C(Process Data)
    B -->|No| D[Skip Process]
    C --> E((End))
    D --> E

    F[Rectangle Node] --> G(Rounded Rectangle)
    G --> H{Diamond Decision}
    H --> I{{Hexagon Node}}
\`\`\`

### Sequence Diagrams - For interactions, API calls, communication flows
\`\`\`mermaid
sequenceDiagram
    participant User
    participant API
    participant Database

    User->>API: Login request
    API->>Database: Validate credentials
    Database-->>API: User data
    API-->>User: Login success

    Note over User,API: Authentication flow
    User->>API: Get user profile
    API->>Database: Query user data
    Database-->>API: Profile data
    API-->>User: Profile response
\`\`\`

**Sequence Diagram Syntax Tips:**
- Use simple participant names without special characters
- Avoid quotes in message text or escape them properly
- Arrow types: -> (solid), --> (dashed), ->> (async), -->> (async response)
- For special characters, use HTML entities: &#35; for hash, &#59; for semicolon
- Add notes with: Note over ParticipantA,ParticipantB: Description
- Example with proper escaping: User->>System: Send data with hash &#35; symbol

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

**IMPORTANT**: When discussing any concept that can be visualized (architecture, workflows, data flow, relationships, hierarchies, timelines, etc.), include a relevant Mermaid diagram to make the explanation clearer and more engaging.

## 🚨 Common Mermaid Syntax Errors to Avoid

### Sequence Diagrams:
- ❌ WRONG: Publisher->>Broker: Publish message to topic "home/temperature"
- ✅ CORRECT: Publisher->>Broker: Publish message to topic home/temperature
- ❌ WRONG: User->System: Send "data" with special chars
- ✅ CORRECT: User->>System: Send data with special chars

### Flowchart Bracket Errors:
- ❌ WRONG: A[Start()] - mixing brackets and parentheses
- ✅ CORRECT: A[Start] or A(Start)
- ❌ WRONG: B[(Process)] - wrong bracket combination
- ✅ CORRECT: B[Process] or B(Process)
- ❌ WRONG: C[{Decision}] - nested brackets
- ✅ CORRECT: C{Decision}
- ❌ WRONG: A[Temperature Sensor (Publisher)] - parentheses inside square brackets
- ✅ CORRECT: A[Temperature Sensor Publisher] or A(Temperature Sensor Publisher)
- ❌ WRONG: B[Mobile App (Subscriber)] - parentheses inside square brackets
- ✅ CORRECT: B[Mobile App Subscriber] or B(Mobile App Subscriber)

### Character Escaping:
- Use HTML entities for special characters
- Hash symbol: &#35; instead of #
- Semicolon: &#59; instead of ;
- Quotes: &#34; instead of "

### Participant Names:
- Use simple names without spaces or special characters
- ✅ CORRECT: participant UserService
- ❌ WRONG: participant "User Service"

### Message Text:
- Keep message text simple and avoid quotes
- Use descriptive but concise text
- Avoid line breaks within message text

### Bracket Usage Rules:
- Square brackets [] are for node labels in flowcharts
- Round brackets () are for rounded rectangle nodes
- ❌ WRONG: A[Start()] or A[(Start)]
- ✅ CORRECT: A[Start] or A(Start)
- ❌ WRONG: A[Process(data)]
- ✅ CORRECT: A[Process data] or A(Process data)

### Node Shape Examples:
- Rectangle: A[Text]
- Rounded rectangle: A(Text)
- Circle: A((Text))
- Rhombus/Diamond: A{Text}
- Hexagon: A{{Text}}
- Parallelogram: A[/Text/]
- Trapezoid: A[\\Text\\]

### Common Bracket Mixing Errors:
- ❌ A[Start()] - Don't mix [] with ()
- ❌ B[(Process)] - Don't put () inside []
- ❌ C[{Decision}] - Don't put {} inside []
- ❌ D({Text}) - Don't put {} inside ()
- ❌ E[[Text]] - Don't double brackets
- ❌ F((Text)) but wrote F(Text) - Missing double parentheses for circles
- ❌ A[Temperature Sensor (Publisher)] - NEVER put parentheses inside square brackets
- ❌ B[Mobile App (Subscriber)] - NEVER put parentheses inside square brackets
- ❌ C[Process (Step 1)] - NEVER put parentheses inside square brackets

### Correct Bracket Usage:
- ✅ A[Text] - Rectangle
- ✅ B(Text) - Rounded rectangle
- ✅ C{Text} - Diamond
- ✅ D((Text)) - Circle (note: double parentheses)
- ✅ E{{Text}} - Hexagon (note: double braces)

### Flowchart Connection Syntax Errors:
- ❌ WRONG: A -- Text --> B (mixing -- with -->)
- ✅ CORRECT: A -->|Text| B (use arrow with label)
- ❌ WRONG: A - B (single dash, no arrow)
- ✅ CORRECT: A --> B (proper arrow)
- ❌ WRONG: A[Node] -- "Long text with spaces" --> B[Node]
- ✅ CORRECT: A[Node] -->|Long text with spaces| B[Node]

### Flowchart Arrow Types:
- --> (solid arrow)
- -.-> (dotted arrow)
- ==> (thick arrow)
- -->|Label| (arrow with label)
- -.->|Label| (dotted arrow with label)
- ==>|Label| (thick arrow with label)`;
};
