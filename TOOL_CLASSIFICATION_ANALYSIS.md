# Tool Classification Analysis
## Refactor: Tools to LLM Agent Mode

### Purpose
Classify existing tools into two categories:
1. **LLM-driven Tools**: Autonomous operations the LLM can use freely
2. **User-invoked Workflows**: Complex operations that users explicitly trigger

---

## Classification Criteria

### LLM-Driven Tools (Keep as Tools)
- ✅ Read-only operations
- ✅ Safe for autonomous use
- ✅ Low/no side effects
- ✅ Information gathering & analysis
- ✅ Commonly chained in multi-step tasks
- ✅ Generally don't require approval

### User-Invoked Workflows (Convert to Workflows)
- ✅ Write/modify operations
- ✅ Destructive operations
- ✅ High-risk actions
- ✅ Complex multi-step procedures
- ✅ User should have explicit control
- ✅ Typically require approval

---

## Current Tools Analysis

### 1. `read_file` ✅ **KEEP AS TOOL**
- **Type**: File Operations
- **Description**: Reads file content, supports partial reading (line ranges)
- **Requires Approval**: `false`
- **Permissions**: `ReadFiles`
- **Classification**: **LLM-driven Tool**

**Rationale:**
- Read-only operation, no side effects
- Fundamental for code analysis and understanding
- LLM needs autonomous access for investigation
- Safe for agent loops

**Termination Behavior**: `terminate=false` (typically part of analysis chain)

---

### 2. `search` ✅ **KEEP AS TOOL**
- **Type**: Search Operations
- **Description**: Searches for files or content
- **Requires Approval**: `false`
- **Permissions**: `ReadFiles`
- **Classification**: **LLM-driven Tool**

**Rationale:**
- Read-only operation
- Essential for code navigation and discovery
- Enables LLM to find relevant files autonomously
- No destructive potential

**Termination Behavior**: `terminate=false` (usually followed by reading found files)

---

### 3. `create_file` ⚠️ **HYBRID - BOTH**
- **Type**: File Operations
- **Description**: Creates new file with content
- **Requires Approval**: `true`
- **Permissions**: `WriteFiles`, `CreateFiles`
- **Classification**: **Keep as Tool AND create Workflow variant**

**Rationale:**
- **As Tool**: LLM can suggest file creation with approval gate
  - Useful for generating code, configs, documentation
  - Approval provides safety net
  
- **As Workflow**: User explicitly creates files
  - Direct user control
  - Pre-populated form for parameters
  - Better UX for intentional file creation

**Decision**: Keep both implementations
- Tool: LLM-initiated with approval requirement (current)
- Workflow: Already exists (`create_file_workflow`)

**Termination Behavior**: `terminate=true` (typically final action)

---

### 4. `update_file` 🔄 **CONSIDER WORKFLOW**
- **Type**: File Operations
- **Description**: Updates existing file content (full replacement)
- **Requires Approval**: `true`
- **Permissions**: `ReadFiles`, `WriteFiles`
- **Classification**: **Could be either, lean toward Tool**

**Rationale for TOOL:**
- With approval gate, LLM can suggest updates safely
- Common in agent workflows (read → analyze → update)
- Approval provides safety

**Rationale for WORKFLOW:**
- Destructive operation (replaces content)
- User might want explicit control
- Could confuse users if LLM modifies files

**Recommendation**: **Keep as Tool** (with approval)
- Current `requires_approval=true` provides safety
- Enable LLM-driven code refactoring with oversight
- Future: Consider adding a safer "patch_file" tool for partial updates

**Termination Behavior**: `terminate=true` (usually final action)

---

### 5. `append_file` ✅ **KEEP AS TOOL**
- **Type**: File Operations
- **Description**: Appends content to existing file
- **Requires Approval**: (need to verify)
- **Permissions**: `ReadFiles`, `WriteFiles`
- **Classification**: **LLM-driven Tool**

**Rationale:**
- Non-destructive (doesn't remove existing content)
- Safer than update/delete
- Useful for logging, accumulating results
- Common in agent workflows

**Recommendation**: Ensure `requires_approval=true`

**Termination Behavior**: `terminate=false` (often part of multi-step process)

---

### 6. `delete_file` ❌ **CONVERT TO WORKFLOW**
- **Type**: File Operations
- **Description**: Deletes a file
- **Requires Approval**: `true`
- **Permissions**: `ReadFiles`, `DeleteFiles`
- **Classification**: **User-invoked Workflow**

**Rationale:**
- **Destructive operation** - irreversible
- High risk of data loss
- Users should explicitly request deletion
- Not a common autonomous LLM need
- Better suited for explicit user action

**Migration Path:**
1. Create `DeleteFileWorkflow` in workflow_system
2. Mark tool as deprecated
3. Update frontend to use workflow
4. Eventually remove tool

**Alternative**: Keep as tool but with stricter safeguards
- Require explicit confirmation
- Only allow in specific agent roles
- Add "trash" feature instead of permanent deletion

**Recommendation**: **Convert to Workflow**

---

### 7. `execute_command` ❌ **CONVERT TO WORKFLOW**
- **Type**: Command Execution
- **Description**: Executes arbitrary shell commands
- **Requires Approval**: `true`
- **Permissions**: `ExecuteCommands`
- **Classification**: **User-invoked Workflow**

**Rationale:**
- **HIGHEST RISK** - can execute any shell command
- Potential for system damage, security breaches
- Even with approval, too dangerous for autonomous use
- Users should have full visibility and control
- Better suited for explicit "run command" workflow

**Security Concerns:**
- Command injection risks
- Filesystem access
- Network access
- Process spawning
- Resource consumption

**Migration Path:**
1. Create `ExecuteCommandWorkflow` with enhanced UI
  - Show command preview
  - Display potential risks
  - Require explicit confirmation
2. Deprecate tool immediately
3. Consider sandboxing/allowlist for workflows
4. Eventually remove tool

**Recommendation**: **URGENT - Convert to Workflow**
- Mark tool as deprecated NOW
- Create workflow replacement
- Add security warnings

---

## Summary Table

| Tool Name | Current Type | Requires Approval | Recommendation | Priority |
|-----------|-------------|-------------------|----------------|----------|
| `read_file` | Tool | No | ✅ Keep as Tool | - |
| `search` | Tool | No | ✅ Keep as Tool | - |
| `create_file` | Tool | Yes | ⚠️ Keep as Both | Low |
| `update_file` | Tool | Yes | ✅ Keep as Tool | - |
| `append_file` | Tool | ? | ✅ Keep as Tool | Medium (verify approval) |
| `delete_file` | Tool | Yes | ❌ Convert to Workflow | High |
| `execute_command` | Tool | Yes | ❌ Convert to Workflow | **URGENT** |

---

## Implementation Plan

### Phase 1: Immediate Security (High Priority)
1. ✅ **Verify `append_file` has `requires_approval=true`**
2. ✅ **Mark `execute_command` as deprecated**
3. ✅ **Create `ExecuteCommandWorkflow`**
4. ⚠️ **Update frontend to warn about deprecated tools**

### Phase 2: Tool Migration (Medium Priority)
1. ⚠️ **Create `DeleteFileWorkflow`**
2. ⚠️ **Mark `delete_file` tool as deprecated**
3. ⚠️ **Update frontend to use workflows**
4. ⏳ **Add usage analytics to track tool vs workflow usage**

### Phase 3: Cleanup (Low Priority)
1. ⏳ **Remove deprecated tools after migration period**
2. ⏳ **Update documentation**
3. ⏳ **Add workflow examples to docs**

---

## Workflow Candidates (Future)

### Potential New Workflows
Based on common user needs, consider creating:

1. **`RefactorCodeWorkflow`**
   - Read file → Analyze → Update with changes
   - User reviews proposed changes
   - Safer than direct LLM file modification

2. **`CreateProjectWorkflow`**
   - Multi-step: Create directory structure, files, configs
   - Templated project setup
   - User configures via form

3. **`RunTestsWorkflow`**
   - Execute test commands
   - Display results in UI
   - Safer than general command execution

4. **`GitOperationWorkflow`**
   - Common git commands (status, diff, commit)
   - Sandboxed git operations
   - Better UX than shell commands

5. **`FindAndReplaceWorkflow`**
   - Search across files
   - Preview replacements
   - Batch update with approval

---

## Decision Matrix

### When to Keep as Tool
```
Operation Type: Read-only OR (Write + Approval)
Risk Level: Low-Medium
Autonomy Need: High
Common in Agent Loops: Yes
→ Keep as Tool
```

### When to Convert to Workflow
```
Operation Type: Destructive OR High-Risk
Risk Level: High
Autonomy Need: Low
User Control Needed: High
→ Convert to Workflow
```

---

## Agent Role Permissions

Consider implementing role-based tool access:

### **Planner Role** (Read-only)
- ✅ `read_file`
- ✅ `search`
- ❌ No write operations

### **Actor Role** (Read + Controlled Write)
- ✅ `read_file`
- ✅ `search`
- ✅ `create_file` (with approval)
- ✅ `update_file` (with approval)
- ✅ `append_file` (with approval)
- ❌ `delete_file` (use workflow)
- ❌ `execute_command` (use workflow)

### **Admin Role** (Future)
- All tools and workflows
- Reduced approval requirements
- For trusted automation

---

## Migration Communication

### User Communication
```
⚠️ Tool System Update

Some tools are being converted to workflows for better safety and control:

- `delete_file` → Use "Delete File" workflow
- `execute_command` → Use "Execute Command" workflow

What's changing?
- Safer operations with better UI
- Clearer parameter input
- Same functionality, better experience

Timeline:
- Now: Both tools and workflows available
- 2 weeks: Tools deprecated with warnings
- 4 weeks: Tools removed

Questions? See migration guide.
```

### Developer Communication
```
🛠️ Tool System Refactor

LLM-driven tools and user-workflows are now separate systems:

**Tools** (LLM autonomous use):
- Read operations
- Safe, repeatable actions
- Used in agent loops

**Workflows** (User-invoked):
- Write/delete operations
- High-risk actions
- Explicit user control

See TOOL_CLASSIFICATION_ANALYSIS.md for details.
```

---

## Testing Plan

### Tool Testing
- [ ] Verify all tools have correct `requires_approval` flags
- [ ] Test agent loop with each tool
- [ ] Verify timeout handling for each tool
- [ ] Test error scenarios

### Workflow Testing
- [ ] Test new workflow UI
- [ ] Verify parameter validation
- [ ] Test approval flow (if applicable)
- [ ] Test workflow execution feedback

### Integration Testing
- [ ] Test LLM calling tools autonomously
- [ ] Test user invoking workflows
- [ ] Test approval gates
- [ ] Test error handling

---

## Recommendations Summary

### ✅ Keep as Tools (7)
1. `read_file` - Read-only, essential
2. `search` - Read-only, navigation
3. `create_file` - With approval, useful for LLM
4. `update_file` - With approval, enables refactoring
5. `append_file` - Non-destructive, useful

### ❌ Convert to Workflows (2)
1. `delete_file` - **HIGH PRIORITY** - Destructive
2. `execute_command` - **URGENT** - Security risk

### ⚠️ Hybrid (1)
1. `create_file` - Keep tool, workflow already exists

---

## Next Steps

1. ✅ **Review and approve this classification**
2. ⏳ **Verify `append_file` approval requirement**
3. ⏳ **Create `ExecuteCommandWorkflow`** (URGENT)
4. ⏳ **Create `DeleteFileWorkflow`** (High Priority)
5. ⏳ **Update design.md with migration plan**
6. ⏳ **Update tasks.md with implementation tasks**

---

## Conclusion

Most existing tools are appropriate for LLM autonomous use:
- Read operations remain as tools ✅
- Write operations with approval remain as tools ✅
- Destructive/high-risk operations convert to workflows ⚠️

This classification balances:
- **Safety**: Dangerous operations require explicit user action
- **Autonomy**: LLM can perform safe operations freely
- **Productivity**: Common operations don't require manual intervention
- **Control**: Users maintain control over critical actions

The agent loop approval mechanism provides an additional safety layer for tools that remain autonomous but require oversight.

