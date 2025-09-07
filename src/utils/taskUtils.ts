import { serviceFactory } from '../services/ServiceFactory';
import { useChatStore } from '../store/chatStore';
import { Message } from '../types/chat';

const SCRIPT_GENERATION_SYSTEM_PROMPT = `
You are an expert AI assistant that translates natural language commands into executable JavaScript code for a desktop automation tool.

Your task is to generate a JavaScript script based on the user's request.

The script will be executed in a sandboxed Web Worker environment. It has NO access to the DOM, window, or any standard browser APIs.

The ONLY way to interact with the system is through a globally available async function:
invoke(command: string, args: object): Promise<any>

The available 'invoke' commands are:
- invoke('fs_read_file', { path: string }): Promise<string> - Reads the content of a file.
- invoke('fs_write_file', { path: string, contents: string }): Promise<void> - Writes content to a file, overwriting it if it exists.
- invoke('fs_list_dir', { path: string }): Promise<string[]> - Lists the contents of a directory.
- invoke('fs_delete', { path: string }): Promise<void> - Deletes a file or an empty directory. For deleting a directory with contents, you must first delete the contents.

IMPORTANT RULES:
1.  ONLY use the provided 'invoke' function for any side effects.
2.  Do NOT use any other APIs like 'fetch', 'setTimeout', 'localStorage', etc.
3.  The script must be self-contained. Do not assume any external libraries are available.
4.  Wrap your entire script in an async IIFE (Immediately Invoked Function Expression) to use await. e.g., (async () => { ... })();
5.  Provide ONLY the JavaScript code, without any explanations or markdown formatting.
`;

export const generateScriptForTask = async (naturalLanguageInput: string): Promise<string> => {
  const messages: Message[] = [
    { role: 'system', content: SCRIPT_GENERATION_SYSTEM_PROMPT, id: 'system' },
    { role: 'user', content: naturalLanguageInput, id: 'user' },
  ];

  const chatStoreState = useChatStore.getState();
  const modelToUse = chatStoreState.selectedModel || (chatStoreState.models.length > 0 ? chatStoreState.models[0] : undefined);

  if (!modelToUse) {
    throw new Error("No model available for script generation.");
  }

  return new Promise((resolve, reject) => {
    let response = '';
    const handleChunk = (rawMessage: string) => {
      if (rawMessage.trim() === '[DONE]') {
        // Clean up the script, removing markdown fences
        const cleanScript = response.trim().replace(/```javascript|```/g, '').trim();
        resolve(cleanScript);
        return;
      }
      if (!rawMessage || rawMessage.trim() === '') return;

      const jsonObjects = rawMessage.split(/(?<=})\s*(?={)/);
      for (const jsonStr of jsonObjects) {
        if (!jsonStr.trim()) continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.choices && data.choices.length > 0) {
            const content = data.choices[0]?.delta?.content;
            if (content) {
              response += content;
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }
    };

    serviceFactory.executePrompt(messages, modelToUse, handleChunk)
      .then(() => {
        const cleanScript = response.trim().replace(/```javascript|```/g, '').trim();
        resolve(cleanScript);
      })
      .catch(reject);
  });
};