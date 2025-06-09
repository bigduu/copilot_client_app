import { ChatService } from './ChatService';
import { FavoritesService } from './FavoritesService';
import { SystemPromptService } from './SystemPromptService';
import { ToolService } from './ToolService';

export { ChatService } from './ChatService';
export { FavoritesService } from './FavoritesService';
export { SystemPromptService } from './SystemPromptService';
export { ToolService } from './ToolService';

// 创建服务实例的便捷函数
export const createServices = () => ({
  chat: ChatService.getInstance(),
  favorites: FavoritesService.getInstance(),
  systemPrompt: SystemPromptService.getInstance(),
  tool: ToolService.getInstance(),
});

// 单例访问
export const services = createServices();
