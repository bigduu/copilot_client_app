import { ChatService } from './ChatService';
import { FavoritesService } from './FavoritesService';
import { SystemPromptService } from './SystemPromptService';
import { MessageProcessor, messageProcessor } from './MessageProcessor';

export { ChatService } from './ChatService';
export { FavoritesService } from './FavoritesService';
export { SystemPromptService } from './SystemPromptService';
export { MessageProcessor, messageProcessor } from './MessageProcessor';

// 创建服务实例的便捷函数
export const createServices = () => ({
  chat: ChatService.getInstance(),
  favorites: FavoritesService.getInstance(),
  systemPrompt: SystemPromptService.getInstance(),
  messageProcessor: messageProcessor,
});

// 单例访问
export const services = createServices();
