/**
 * Main export file for the UnifiedChatManager core module
 * Provides a unified entry point, exporting all core classes and interfaces
 */

// Core Manager
export { UnifiedChatManager } from './UnifiedChatManager';

// Support Components
export { StateManager } from './StateManager';
export { AttachmentProcessor } from './AttachmentProcessor';
export { ApprovalManager } from './ApprovalManager';
export { ErrorHandler } from './ErrorHandler';
export { PerformanceMonitor } from './PerformanceMonitor';

// Interface Definitions
export * from '../interfaces/chat-manager';

// Type Definitions
export * from '../types/unified-chat';

// Default export - for easy direct import
export { UnifiedChatManager as default } from './UnifiedChatManager';
