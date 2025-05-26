import { MessageType } from "../types/chat";

/**
 * 根据消息类型选择对应的UI组件
 */
export const selectMessageComponent = (messageType: MessageType): string => {
  switch (messageType) {
    case 'system':
      return 'SystemMessage';
    case 'streaming':
      return 'StreamingMessageItem';
    case 'tool_call':
    case 'approval_request':
      return 'ToolCallMessageCard';
    case 'tool_result':
      return 'ToolResultCard';
    case 'processor_update':
      return 'ProcessorUpdateCard';
    case 'error':
      return 'ErrorMessageCard';
    case 'normal':
    default:
      return 'MessageCard';
  }
};

/**
 * 获取消息类型的显示名称
 */
export const getMessageTypeDisplayName = (messageType: MessageType): string => {
  switch (messageType) {
    case 'system':
      return '系统消息';
    case 'streaming':
      return '流式消息';
    case 'tool_call':
      return '工具调用';
    case 'tool_result':
      return '工具结果';
    case 'processor_update':
      return '处理器更新';
    case 'approval_request':
      return '等待批准';
    case 'error':
      return '错误消息';
    case 'normal':
    default:
      return '普通消息';
  }
};

/**
 * 检查消息类型是否需要特殊处理
 */
export const isSpecialMessageType = (messageType: MessageType): boolean => {
  return ['tool_call', 'tool_result', 'approval_request', 'error'].includes(messageType);
};

/**
 * 获取消息类型的样式类名
 */
export const getMessageTypeClassName = (messageType: MessageType): string => {
  switch (messageType) {
    case 'system':
      return 'message-system';
    case 'streaming':
      return 'message-streaming';
    case 'tool_call':
      return 'message-tool-call';
    case 'tool_result':
      return 'message-tool-result';
    case 'processor_update':
      return 'message-processor-update';
    case 'approval_request':
      return 'message-approval-request';
    case 'error':
      return 'message-error';
    case 'normal':
    default:
      return 'message-normal';
  }
};
