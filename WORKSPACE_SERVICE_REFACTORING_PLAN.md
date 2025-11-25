# Workspace Service 重构计划

**日期**: 2024-11-25  
**文件**: `crates/web_service/src/workspace_service.rs` (435行)  
**目标**: 模块化重构，应用 Handler 模式

---

## 📊 当前结构分析

### **类型定义** (67行)
- `WorkspaceInfo` - 工作区信息
- `StoredRecentWorkspace` - 存储的最近工作区
- `ValidatePathRequest` - 路径验证请求
- `AddRecentRequest` - 添加最近工作区请求
- `WorkspaceMetadata` - 工作区元数据
- `PathSuggestionsResponse` - 路径建议响应
- `PathSuggestion` - 路径建议
- `SuggestionType` - 建议类型枚举

### **主要功能域**

#### 1. **路径验证域** (~100行)
- `validate_path()` - 验证路径是否为有效工作区
- `count_files()` - 统计文件数量
- `is_likely_workspace()` - 判断是否可能是工作区

#### 2. **最近工作区管理域** (~130行)
- `get_recent_workspaces()` - 获取最近工作区列表
- `add_recent_workspace()` - 添加工作区到最近列表
- `recent_workspaces_file()` - 获取存储文件路径
- `load_recent_workspaces()` - 加载最近工作区
- `save_recent_workspaces()` - 保存最近工作区

#### 3. **路径建议域** (~100行)
- `get_path_suggestions()` - 获取路径建议
- 生成各种类型的建议（最近、常用、系统目录）

---

## 🎯 重构方案

### **目标结构**
```
workspace_service/
├── mod.rs                    (~80行) - 协调器 + WorkspaceService
├── types.rs                  (~70行) - 所有类型定义
├── path_validator.rs         (~100行) - 路径验证功能
├── recent_manager.rs         (~130行) - 最近工作区管理
└── suggestion_provider.rs    (~80行) - 路径建议功能
```

### **模块职责**

#### **mod.rs - 协调器**
```rust
pub struct WorkspaceService {
    data_dir: PathBuf,
    path_validator: PathValidator,
    recent_manager: RecentWorkspaceManager,
    suggestion_provider: SuggestionProvider,
}

impl WorkspaceService {
    pub fn new(data_dir: PathBuf) -> Self { ... }
    
    // 委托给各个 handler
    pub async fn validate_path(&self, path: &str) -> Result<WorkspaceInfo> {
        self.path_validator.validate(path).await
    }
    
    pub async fn get_recent_workspaces(&self) -> Result<Vec<WorkspaceInfo>> {
        self.recent_manager.get_recent(self.data_dir).await
    }
    
    pub async fn get_path_suggestions(&self) -> Result<PathSuggestionsResponse> {
        self.suggestion_provider.get_suggestions(&self.recent_manager).await
    }
}
```

#### **types.rs - 类型定义**
- 所有公共类型和枚举
- 无业务逻辑，纯数据结构

#### **path_validator.rs - 路径验证**
```rust
pub struct PathValidator;

impl PathValidator {
    pub async fn validate(&self, path: &str) -> Result<WorkspaceInfo> { ... }
    async fn count_files(&self, path: &str) -> Result<usize> { ... }
    async fn is_likely_workspace(&self, path: &str) -> bool { ... }
}
```

#### **recent_manager.rs - 最近工作区管理**
```rust
pub struct RecentWorkspaceManager;

impl RecentWorkspaceManager {
    pub async fn get_recent(&self, data_dir: &Path) -> Result<Vec<WorkspaceInfo>> { ... }
    pub async fn add_recent(&self, data_dir: &Path, request: AddRecentRequest) -> Result<()> { ... }
    async fn load_recent_workspaces(&self, file_path: &Path) -> Result<Vec<StoredRecentWorkspace>> { ... }
    async fn save_recent_workspaces(&self, file_path: &Path, workspaces: Vec<StoredRecentWorkspace>) -> Result<()> { ... }
}
```

#### **suggestion_provider.rs - 路径建议**
```rust
pub struct SuggestionProvider;

impl SuggestionProvider {
    pub async fn get_suggestions(&self, recent_manager: &RecentWorkspaceManager) -> Result<PathSuggestionsResponse> { ... }
    fn get_common_paths(&self) -> Vec<PathSuggestion> { ... }
    fn get_system_paths(&self) -> Vec<PathSuggestion> { ... }
}
```

---

## 📋 重构步骤

### **Phase 1: 创建模块结构**
1. ✅ 创建 `workspace_service/` 文件夹
2. ✅ 创建 `types.rs` - 提取所有类型定义
3. ✅ 创建 `path_validator.rs` - 空框架
4. ✅ 创建 `recent_manager.rs` - 空框架
5. ✅ 创建 `suggestion_provider.rs` - 空框架
6. ✅ 创建 `mod.rs` - 协调器框架

### **Phase 2: 迁移代码**
7. ✅ 迁移类型定义到 `types.rs`
8. ✅ 实现 `PathValidator`
9. ✅ 实现 `RecentWorkspaceManager`
10. ✅ 实现 `SuggestionProvider`
11. ✅ 完成 `mod.rs` 协调逻辑

### **Phase 3: 更新引用**
12. ✅ 更新 `lib.rs` 或 `services/mod.rs` 的导出
13. ✅ 检查所有使用 `WorkspaceService` 的地方
14. ✅ 确保所有类型正确导出

### **Phase 4: 清理和验证**
15. ✅ 删除原 `workspace_service.rs`
16. ✅ 运行编译测试
17. ✅ 修复任何编译错误
18. ✅ 运行单元测试

---

## 🎯 重构原则

1. **保持接口不变** - 外部调用者不需要修改代码
2. **内部模块化** - 按功能域清晰分离
3. **单一职责** - 每个模块只负责一个功能
4. **易于测试** - 每个 Handler 可独立测试
5. **保持简洁** - 不过度设计，保持实用

---

## ✅ 预期成果

**Before**:
- 1个文件，435行
- 所有功能混在一起
- 难以测试和维护

**After**:
- 5个模块，总计~460行
- 功能域清晰分离
- 易于测试和扩展
- 遵循单一职责原则

---

**开始重构！** 🚀
