# 工具系统文档

本模块的详细开发者指南已移动到统一的文档目录中。

📖 **请查看完整文档**: [`docs/architecture/tools-system.md`](../../../docs/architecture/tools-system.md)

## 快速导航

- [系统概览](../../../docs/architecture/tools-system.md#概览)
- [架构关系](../../../docs/architecture/tools-system.md#架构关系)
- [开发接口](../../../docs/architecture/tools-system.md#开发接口)
- [添加新工具类别](../../../docs/architecture/tools-system.md#添加新工具类别)
- [测试指南](../../../docs/architecture/tools-system.md#测试)
- [最佳实践](../../../docs/architecture/tools-system.md#最佳实践)

## 核心组件

- [`Category`](category.rs) - 工具类别 trait 定义
- [`ToolManager`](tool_manager.rs) - 工具管理器
- [`categories/`](categories/) - 具体类别实现

---
> 📁 文档整合说明：为了更好地组织项目文档，技术文档已统一移动到 `docs/` 目录下进行集中管理。