# 数据清理指南

## 问题描述

前端加载旧聊天数据时出现序列化错误：

```
Serialization error: unknown variant `Idle`, expected one of `idle`, ...
```

**原因**: 旧数据使用 PascalCase 状态名（如 `Idle`），新后端期望 snake_case（如 `idle`）

---

## 解决方案

### 方法 1: 手动删除数据目录（推荐）

#### macOS

```bash
# 1. 关闭应用
# 2. 删除数据目录
rm -rf "$HOME/Library/Application Support/com.copilot.chat/conversations"
rm -rf "$HOME/Library/Application Support/com.copilot.chat/sessions"

# 3. 重启应用
```

#### Linux

```bash
# 1. 关闭应用
# 2. 删除数据目录
rm -rf "$HOME/.local/share/copilot-chat/conversations"
rm -rf "$HOME/.local/share/copilot-chat/sessions"

# 3. 重启应用
```

#### Windows

```powershell
# 1. 关闭应用
# 2. 删除数据目录
Remove-Item -Recurse -Force "$env:APPDATA\com.copilot.chat\conversations"
Remove-Item -Recurse -Force "$env:APPDATA\com.copilot.chat\sessions"

# 3. 重启应用
```

---

### 方法 2: 使用清理脚本

#### macOS/Linux

```bash
# 给脚本添加执行权限
chmod +x scripts/clean_data.sh

# 运行脚本（会自动备份）
./scripts/clean_data.sh
```

#### Fish Shell

```bash
# 给脚本添加执行权限
chmod +x scripts/clean_data.fish

# 运行脚本（会自动备份）
./scripts/clean_data.fish
```

---

### 方法 3: 开发模式清理（当前项目）

如果你在开发模式下运行（`npm run tauri dev`），数据可能存储在项目目录：

```bash
# 在项目根目录
rm -rf conversations/
rm -rf sessions/
```

---

## 验证清理成功

1. **重启应用**
2. **检查 Console**：应该没有序列化错误
3. **创建新聊天**：应该能正常工作
4. **发送消息**：应该能正常接收回复

---

## 备份恢复（如果需要）

如果使用脚本清理，会自动创建备份：

```bash
# 备份位置
$HOME/Library/Application Support/com.copilot.chat.backup.YYYYMMDD_HHMMSS

# 恢复备份
rm -rf "$HOME/Library/Application Support/com.copilot.chat"
mv "$HOME/Library/Application Support/com.copilot.chat.backup.YYYYMMDD_HHMMSS" \
   "$HOME/Library/Application Support/com.copilot.chat"
```

---

## 常见问题

### Q: 清理后数据会丢失吗？

A: 是的，所有聊天历史会被删除。但这是必要的，因为旧数据格式不兼容。

### Q: 能否迁移旧数据？

A: 理论上可以，但需要编写迁移脚本转换状态名格式。考虑到这是开发阶段，直接清理更简单。

### Q: 如何避免将来再次出现这个问题？

A: 新后端已经使用 snake_case 序列化，将来不会再有这个问题。

### Q: 清理后还是有错误怎么办？

A: 
1. 确认应用已完全关闭
2. 检查是否还有其他数据目录
3. 查看后端日志确认错误来源
4. 尝试完全重新安装应用

---

## 快速清理命令（复制粘贴）

### macOS 一键清理

```bash
rm -rf "$HOME/Library/Application Support/com.copilot.chat/conversations" \
       "$HOME/Library/Application Support/com.copilot.chat/sessions" && \
echo "✅ 数据已清理，请重启应用"
```

### Linux 一键清理

```bash
rm -rf "$HOME/.local/share/copilot-chat/conversations" \
       "$HOME/.local/share/copilot-chat/sessions" && \
echo "✅ 数据已清理，请重启应用"
```

### 开发模式一键清理

```bash
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat && \
rm -rf conversations/ sessions/ && \
echo "✅ 开发数据已清理，请重启应用"
```

---

## 下一步

清理数据后，你可以：

1. **重启应用** - 应该能正常启动
2. **创建新聊天** - 测试基本功能
3. **开始测试** - 按照 `TESTING_GUIDE.md` 进行测试

---

**需要帮助？** 查看 `TESTING_GUIDE.md` 了解如何测试新功能。

