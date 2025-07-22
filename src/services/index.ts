import { ChatService } from './ChatService';
import { FavoritesService } from './FavoritesService';
import { SystemPromptService } from './SystemPromptService';
import { ToolService } from './ToolService';
import { ToolCallProcessor } from './ToolCallProcessor';
import { StorageService } from './StorageService';
import { TauriService } from './TauriService';

export { ChatService } from './ChatService';
export { FavoritesService } from './FavoritesService';
export { SystemPromptService } from './SystemPromptService';
export { ToolService } from './ToolService';
export { ToolCallProcessor } from './ToolCallProcessor';
export { StorageService } from './StorageService';
export { TauriService } from './TauriService';

// Convenient function for creating service instances
export const createServices = () => ({
  chat: ChatService.getInstance(),
  favorites: FavoritesService.getInstance(),
  systemPrompt: SystemPromptService.getInstance(),
  tool: ToolService.getInstance(),
  toolCallProcessor: ToolCallProcessor.getInstance(),
});

// Singleton access
export const services = createServices();
