# 🧪 MessageProcessor测试检查清单

## 🔍 立即可测试的功能

### **1. 控制台日志验证**
启动应用后发送一条消息，应该看到：
```
[MessageProcessor] Initializing tools...
[MessageProcessor] Loaded X tools
[useMessages] Processing message through MessageProcessor
[MessageProcessor] Enhancing system prompt with tool information
[useMessages] Message preprocessed, enhanced messages count: X
[useMessages] Sending preprocessed messages to backend
```

### **2. 网络请求检查**
在浏览器开发者工具的Network标签页中：
- 查找 `execute_prompt` 请求
- 检查请求payload中的`messages`数组
- 第一个message应该是role="system"，content包含工具信息

### **3. 系统提示内容验证**
系统消息应该包含类似内容：
```
=== Available Tools ===

**Local Tools:**
- read_file: 读取文件内容
- create_file: 创建新文件
- ...

**MCP Tools:**
- (如果有MCP服务器连接)

使用方式：当需要使用工具时，请在回复中包含JSON格式：
{"use_tool": true, "tool_type": "local|mcp", "tool_name": "工具名", "parameters": {...}}
```

## 🚀 工具调用测试

### **测试消息示例**：
1. **读取文件**: "请帮我读取package.json文件的内容"
2. **搜索文件**: "请搜索项目中包含'MessageProcessor'的文件"
3. **创建文件**: "请创建一个test.txt文件，内容是'Hello World'"

### **预期行为**：
1. AI应该识别到可用工具
2. 回复中包含工具调用JSON
3. 前端自动解析并执行（安全工具）或显示确认（危险工具）
4. 工具执行结果显示在聊天中

## 🛠️ 故障排除

### **如果工具信息没有出现在系统提示中**：
1. 检查 `get_all_available_tools` 命令是否正常工作
2. 检查控制台是否有MessageProcessor初始化错误
3. 检查toolParser.parseXmlToolList是否正确解析

### **如果工具调用没有被解析**：
1. 检查AI回复的格式是否正确
2. 检查toolParser.parseToolCallsFromContent的正则表达式
3. 检查控制台是否有解析错误

### **如果工具执行失败**：
1. 检查后端工具API是否正常工作
2. 检查工具参数格式是否正确
3. 检查invoke调用的错误信息

## ✅ 成功标志

- [ ] 控制台显示工具加载成功
- [ ] 网络请求包含增强的系统提示
- [ ] AI能识别并使用工具
- [ ] 工具执行结果正确显示
- [ ] 危险工具显示确认界面

## 🔧 调试技巧

### **启用详细日志**：
在MessageProcessor.ts中的所有console.log都应该显示，如果没有：
1. 检查浏览器控制台过滤设置
2. 检查MessageProcessor是否被正确初始化

### **检查状态**：
在浏览器控制台中运行：
```javascript
// 检查MessageProcessor状态
console.log(window.__messageProcessorDebug);
```

### **手动测试工具API**：
```javascript
// 在控制台测试工具列表API
invoke('get_all_available_tools').then(console.log);

// 测试工具执行API
invoke('execute_local_tool', {
  tool_name: 'read_file',
  parameters: [{ name: 'path', value: 'package.json', description: '', required: true }]
}).then(console.log);
```

## 🎯 核心验证点

**最重要的验证**：发送消息时，在Network面板中检查`execute_prompt`请求的messages数组，确认第一个系统消息包含了工具信息。

如果这个验证通过，说明我们完全解决了您最初发现的问题！ 🎉
