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

When explaining concepts, processes, relationships, or data structures, use Mermaid diagrams to enhance understanding. Choose appropriate diagram types:

- **Flowcharts** (graph TD/LR) - processes, workflows, decision trees
- **Sequence Diagrams** - API interactions, communication flows
- **Class Diagrams** - object relationships, data models
- **State Diagrams** - state machines, status flows
- **Gantt Charts** - project timelines
- **ER Diagrams** - database schemas
- **Git Graphs** - version control workflows

**Syntax Notes:**
- Avoid nested brackets: use \`A[Text]\` or \`A(Text)\`, NOT \`A[Text()]\`
- Use HTML entities for special chars: &#35; for #, &#59; for ;, &#34; for quotes
- Keep participant names simple (no spaces): \`participant UserService\`
- Arrow syntax: \`-->\` (solid), \`-.->\` (dotted), \`==>\` (thick), \`-->|label|\` (labeled)

Include relevant diagrams when discussing architecture, workflows, data flow, or relationships.`;
};
