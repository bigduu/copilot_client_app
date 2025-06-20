/**
 * UnifiedChatManager 核心模块主要导出文件
 * 提供统一的入口点，导出所有核心类和接口
 */

// 核心管理器
export { UnifiedChatManager } from './UnifiedChatManager';

// 支持组件
export { StateManager } from './StateManager';
export { AttachmentProcessor } from './AttachmentProcessor';
export { ApprovalManager } from './ApprovalManager';
export { ErrorHandler } from './ErrorHandler';
export { PerformanceMonitor } from './PerformanceMonitor';

// 接口定义
export * from '../interfaces/chat-manager';

// 类型定义
export * from '../types/unified-chat';

// 默认导出 - 便于直接导入使用
export { UnifiedChatManager as default } from './UnifiedChatManager';