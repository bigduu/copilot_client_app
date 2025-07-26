// Test utility to verify service mode configuration
import { serviceFactory } from '../services/ServiceFactory';

export const testServiceMode = () => {
  console.log('🔧 Service Mode Test');
  console.log('Current mode:', serviceFactory.getCurrentMode());
  console.log('Expected default mode: openai');
  
  // Test localStorage
  const savedMode = localStorage.getItem('copilot_service_mode');
  console.log('Saved mode in localStorage:', savedMode);
  
  // Test service instances
  const chatService = serviceFactory.getChatService();
  console.log('Chat service type:', chatService.constructor.name);
  
  return {
    currentMode: serviceFactory.getCurrentMode(),
    isOpenAIDefault: serviceFactory.getCurrentMode() === 'openai',
    chatServiceType: chatService.constructor.name
  };
};

// Auto-run test in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Run test after a short delay to ensure localStorage is available
  setTimeout(() => {
    const result = testServiceMode();
    console.log('Service mode test result:', result);
  }, 100);
}
