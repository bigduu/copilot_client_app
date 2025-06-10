# ToolCategory 系统测试计划

## 新实现的功能

### 1. ToolCategory 结构重设计
- ✅ 从简单枚举改为完整结构体
- ✅ 包含 system_prompt, tools, restrict_conversation 等配置
- ✅ 7个预定义类别：file_read, file_create, file_delete, file_update, file_search, command_execution, general_assistant

### 2. 新增 API 命令
- ✅ `get_tool_categories()` - 获取所有类别
- ✅ `get_category_tools(category_id)` - 获取类别下的工具
- ✅ `update_category_config(category_id, config)` - 更新类别配置
- ✅ `register_tool_to_category(tool_name, category_id)` - 注册工具到类别

### 3. 向后兼容性
- ✅ 保留原有 `get_tool_categories_list()` 和 `get_tools_by_category()` API
- ✅ 使用 LegacyToolCategory 确保现有代码不受影响

## 测试步骤

### 后端测试
1. 编译成功（当前进行中）
2. 启动应用检查配置文件生成
3. 验证 7 个预定义类别是否正确创建
4. 测试新 API 命令是否正常响应

### 前端适配（下一步）
1. 更新 TypeScript 类型定义
2. 修改 SystemPromptService 使用新的 Category API
3. 更新 UI 组件显示类别信息

## 预期配置文件结构
```json
{
  "categories": {
    "file_read": {
      "id": "file_read",
      "name": "文件读取",
      "description": "读取和查看文件内容的工具",
      "system_prompt": "你是一个专门处理文件读取操作的助手...",
      "tools": ["read_file", "list_files"],
      "restrict_conversation": true,
      "enabled": true
    },
    // ... 其他类别
  },
  "tool_configs": {
    "read_file": {
      "name": "read_file",
      "category_id": "file_read",
      "enabled": true,
      "requires_approval": false
    }
    // ... 其他工具配置
  }
}