# ToolService 硬编码清理报告

## 清理概述

已成功清理 `src/services/ToolService.ts` 中的所有硬编码，完全实现"前端零硬编码"原则。

## 清理的硬编码类型

### 1. 工具名称硬编码清理
**清理前：**
```typescript
switch (tool.name) {
  case "execute_command":
  case "create_file":
  case "read_file":
  case "delete_file":
  // ... 硬编码工具名称
}
```
**清理后：**
- 完全移除工具名称的硬编码 switch 语句
- 所有工具处理逻辑改为基于后端配置的规则驱动

### 2. 参数解析规则硬编码清理
**清理前：**
```typescript
case "create_file":
  if (trimmedResponse.includes("|||")) {
    // 硬编码分隔符
  } else {
    // 硬编码回退值
    parameters.push(
      { name: "path", value: "test.txt" }, // 硬编码默认文件名
      { name: "content", value: userDescription }
    );
  }
```
**清理后：**
```typescript
// 获取工具参数解析规则（从后端配置获取）
const config = await this.getToolConfig();
const rule = config.parameterParsingRules[tool.name];

if (!rule) {
  throw new Error(`工具 "${tool.name}" 的参数解析规则必须从后端配置获取，前端不提供硬编码规则`);
}
```

### 3. 结果格式化硬编码清理
**清理前：**
```typescript
switch (toolName) {
  case "execute_command":
    codeLanguage = "bash";
    break;
  case "create_file":
  case "read_file":
    // 硬编码文件扩展名映射
    switch (ext) {
      case "js":
      case "jsx":
        codeLanguage = "javascript";
        // ... 更多硬编码映射
    }
}
```
**清理后：**
```typescript
// 获取工具结果格式化规则（从后端配置获取）
const config = await this.getToolConfig();
const formatRule = config.resultFormattingRules[toolName];

if (!formatRule) {
  throw new Error(`工具 "${toolName}" 的结果格式化规则必须从后端配置获取，前端不提供硬编码格式化逻辑`);
}
```

### 4. 默认值和回退机制清理
**清理前：**
```typescript
return tools.find((tool) => tool.name === toolName) || null; // 默认返回 null
return true; // 默认允许所有工具
return { isValid: true }; // 默认验证通过
```
**清理后：**
```typescript
const tool = tools.find((tool) => tool.name === toolName);
if (!tool) {
  throw new Error(`工具 "${toolName}" 不存在，请检查工具是否已在后端正确注册`);
}

// 所有默认行为都改为抛出明确错误
if (!systemPromptId) {
  throw new Error("系统提示词ID必须提供，不能使用默认权限配置");
}
```

## 新增的类型定义

### ToolConfig 接口
```typescript
export interface ToolConfig {
  parameterParsingRules: Record<string, ToolParameterRule>;
  resultFormattingRules: Record<string, ToolFormatRule>;
  fileExtensionMappings: Record<string, string>;
}

export interface ToolParameterRule {
  separator?: string;
  parameterNames: string[];
  fallbackBehavior?: 'error' | 'use_description';
}

export interface ToolFormatRule {
  codeLanguage: string;
  parameterExtraction?: {
    pathParam?: string;
    filePathParam?: string;
  };
}
```

## 需要后端添加的配置字段

### 1. get_tool_config 命令
后端需要实现返回完整工具配置的命令：

```rust
// 示例配置结构
{
  "parameterParsingRules": {
    "execute_command": {
      "parameterNames": ["command"],
      "fallbackBehavior": "error"
    },
    "create_file": {
      "separator": "|||",
      "parameterNames": ["path", "content"],
      "fallbackBehavior": "use_description"
    },
    "read_file": {
      "parameterNames": ["path"],
      "fallbackBehavior": "error"
    },
    "delete_file": {
      "parameterNames": ["path"],
      "fallbackBehavior": "error"
    }
  },
  "resultFormattingRules": {
    "execute_command": {
      "codeLanguage": "bash"
    },
    "create_file": {
      "codeLanguage": "text",
      "parameterExtraction": {
        "pathParam": "path"
      }
    },
    "read_file": {
      "codeLanguage": "text",
      "parameterExtraction": {
        "pathParam": "path"
      }
    },
    "list_files": {
      "codeLanguage": "bash"
    }
  },
  "fileExtensionMappings": {
    "js": "javascript",
    "jsx": "javascript",  
    "ts": "typescript",
    "tsx": "typescript",
    "py": "python",
    "rs": "rust",
    "json": "json",
    "md": "markdown",
    "html": "html",
    "css": "css",
    "sh": "bash"
  }
}
```

### 2. get_general_mode_config 命令
```rust
{
  "allowAllTools": true
}
```

## 修改的方法签名

以下方法现在是异步的，需要调用方适配：

1. `formatToolResult()` - 现在是 async
2. `buildParameterParsingPrompt()` - 现在是 async  
3. `parseAIParameterResponse()` - 现在是 async

## 严格错误处理

所有硬编码场景现在都会抛出明确的错误：

- 配置缺失时不提供任何默认值
- 工具不存在时明确报错
- 权限检查失败时详细说明原因
- 参数解析规则缺失时要求后端配置

## 验证结果

✅ **工具名称硬编码**: 已完全清理  
✅ **参数解析硬编码**: 已完全清理  
✅ **结果格式化硬编码**: 已完全清理  
✅ **文件扩展名映射硬编码**: 已完全清理  
✅ **默认值和回退机制**: 已完全清理  
✅ **权限检查默认行为**: 已完全清理  

## 下一步工作

1. 后端实现 `get_tool_config` 命令
2. 后端实现 `get_general_mode_config` 命令
3. 后端配置所有工具的参数解析规则
4. 后端配置所有工具的结果格式化规则
5. 测试前端严格模式的错误处理

## 影响的文件

- `src/services/ToolService.ts` - 主要清理文件
- `src/services/ToolCallProcessor.ts` - 适配异步方法调用

通过这次清理，ToolService 现在完全符合"前端零硬编码"原则，所有配置都依赖后端提供，确保了配置的集中管理和动态更新能力。