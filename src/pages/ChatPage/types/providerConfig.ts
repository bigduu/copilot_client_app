/**
 * Provider Configuration Types
 *
 * Types for configuring and switching between different LLM providers.
 */

export interface ProviderConfig {
  provider: string;
  providers: {
    openai?: OpenAIConfig;
    anthropic?: AnthropicConfig;
    gemini?: GeminiConfig;
    copilot?: CopilotConfig;
  };
}

export interface OpenAIConfig {
  api_key: string;
  base_url?: string;
  model?: string;
}

export interface AnthropicConfig {
  api_key: string;
  base_url?: string;
  model?: string;
  max_tokens?: number;
}

export interface GeminiConfig {
  api_key: string;
  base_url?: string;
  model?: string;
}

export interface CopilotConfig {
  // Copilot uses OAuth - no API key required
}

export type ProviderType = 'copilot' | 'openai' | 'anthropic' | 'gemini';

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  copilot: 'GitHub Copilot',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};

export const OPENAI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview' },
  { value: 'gpt-4', label: 'GPT-4' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
] as const;

export const ANTHROPIC_MODELS = [
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (Legacy)' },
  { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
] as const;

export const GEMINI_MODELS = [
  { value: 'gemini-pro', label: 'Gemini Pro' },
  { value: 'gemini-pro-vision', label: 'Gemini Pro Vision' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
] as const;
