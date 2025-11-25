# 🎯 下一步重构目标

**当前进度**: 4个模块已完成 (28个文件, 3,004行)

---

## ✅ 已完成

1. ✅ **message_types** (10个文件, 924行)
2. ✅ **agent_loop_handler** (7个文件, 990行)
3. ✅ **chat_service** (6个文件, 523行)
4. ✅ **workspace_service** (5个文件, 567行)

---

## 🎯 下一步候选（按推荐顺序）

### **推荐顺序 A: Controller 层优化**

#### **1. session_manager.rs** (395行) ⭐️⭐️⭐️
**类型**: 核心服务  
**复杂度**: 中  
**建议**: 拆分成模块
- `session_storage.rs` - Session 存储逻辑
- `session_lifecycle.rs` - 生命周期管理
- `session_validator.rs` - 验证逻辑
- `types.rs` - 类型定义
- `mod.rs` - 协调器

**理由**: 
- 独立的服务模块
- 职责可能混杂
- 适合 Handler 模式
- 影响范围可控

---

#### **2. agent_loop_runner.rs** (380行) ⭐️⭐️
**类型**: 核心服务  
**复杂度**: 高  
**建议**: 仔细评估后再重构

**理由**:
- 复杂的异步流程
- 与 agent_loop_handler 紧密关联
- 可能需要更深入分析

---

#### **3. agent_loop_handler/mod.rs** (569行) ⭐️⭐️
**类型**: 已模块化的协调器  
**建议**: 进一步优化

**理由**:
- 虽然已经模块化，但主文件仍大
- 可以提取更多辅助模块
- 降低单文件复杂度

---

### **推荐顺序 B: Controller 层重构**

#### **4. context/context_lifecycle.rs** (517行) ⭐️
**类型**: Controller 逻辑  
**建议**: 已在 domain 模块中，可能不需要重构

**理由**:
- 已经是 domain 模块的一部分
- 如果进一步拆分可能过度工程化

---

#### **5. context/title_generation.rs** (474行)
**类型**: Controller 逻辑  
**建议**: 同上

---

#### **6. message_processing/file_reference_handler.rs** (453行)
**类型**: 消息处理器  
**建议**: 可以优化但不紧急

---

### **推荐顺序 C: Storage 层**

#### **7. storage/migration.rs** (582行)
**类型**: 数据迁移  
**建议**: 暂时保持

**理由**:
- Migration 代码通常一次性运行
- 重构收益较低

---

#### **8. storage/message_pool_provider.rs** (576行)
**类型**: 存储提供者  
**建议**: 可以考虑模块化

---

## 💡 我的推荐

### **方案1: 继续服务层重构 (推荐)** ⭐️⭐️⭐️

**重构**: `session_manager.rs` (395行)

**优点**:
- 中等复杂度，可控
- 独立服务模块
- 清晰的职责划分
- 适合 Handler 模式
- 与已完成的重构一致

**预期**:
- 拆分成 4-5 个模块
- 约 450-500 行（分离后）
- 提升可维护性

---

### **方案2: 优化现有模块**

**优化**: `agent_loop_handler/mod.rs` (569行)

**优点**:
- 已有模块化基础
- 可以进一步精简
- 降低单文件复杂度

**预期**:
- 提取更多子模块
- 主文件降至 300-400 行

---

### **方案3: 深度重构**

**重构**: `agent_loop_runner.rs` (380行)

**注意**:
- 复杂度高
- 需要深入理解异步流程
- 风险较大
- 建议留到后面

---

## 🤔 你的选择？

1. **session_manager.rs** - 稳健推进 (推荐) ⭐️
2. **agent_loop_handler/mod.rs** - 优化现有
3. **agent_loop_runner.rs** - 挑战高难度
4. **其他目标** - 你说了算

---

**下一步做什么？** 🚀
