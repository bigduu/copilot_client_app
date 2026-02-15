/**
 * Settings Service
 *
 * Service for managing application settings, including provider configuration.
 */

import { apiClient } from '../api';
import type { ProviderConfig } from '../../pages/ChatPage/types/providerConfig';

/**
 * Copilot authentication status
 */
export interface CopilotAuthStatus {
  authenticated: boolean;
  message?: string;
}

/**
 * Device code information for Copilot authentication
 */
export interface DeviceCodeInfo {
  device_code: string;  // The actual device code for polling (not the user code!)
  user_code: string;    // The code user enters in browser
  verification_uri: string;
  expires_in: number;
  interval?: number;    // Polling interval in seconds
}

/**
 * Complete authentication request
 */
export interface CompleteAuthRequest {
  device_code: string;
  interval: number;
  expires_in: number;
}

/**
 * Settings Service
 *
 * Handles all settings-related API calls to the backend.
 */
export class SettingsService {
  /**
   * Get the current provider configuration
   */
  async getProviderConfig(): Promise<ProviderConfig> {
    return apiClient.get<ProviderConfig>('/bamboo/settings/provider');
  }

  /**
   * Save provider configuration
   */
  async saveProviderConfig(config: ProviderConfig): Promise<void> {
    return apiClient.post<void>('/bamboo/settings/provider', config);
  }

  /**
   * Reload configuration (apply changes)
   */
  async reloadConfig(): Promise<void> {
    return apiClient.post<void>('/bamboo/settings/reload');
  }

  /**
   * Check Copilot authentication status
   */
  async getCopilotAuthStatus(): Promise<CopilotAuthStatus> {
    return apiClient.post<CopilotAuthStatus>('/bamboo/copilot/auth/status');
  }

  /**
   * Start Copilot authentication - get device code
   */
  async startCopilotAuth(): Promise<DeviceCodeInfo> {
    return apiClient.post<DeviceCodeInfo>('/bamboo/copilot/auth/start');
  }

  /**
   * Complete Copilot authentication with device code
   */
  async completeCopilotAuth(request: CompleteAuthRequest): Promise<void> {
    return apiClient.post<void>('/bamboo/copilot/auth/complete', request);
  }

  /**
   * Trigger Copilot authentication flow (legacy)
   */
  async authenticateCopilot(): Promise<void> {
    return apiClient.post<void>('/bamboo/copilot/authenticate');
  }

  /**
   * Logout from Copilot (delete cached token)
   */
  async logoutCopilot(): Promise<void> {
    return apiClient.post<void>('/bamboo/copilot/logout');
  }
}

/**
 * Singleton instance
 */
export const settingsService = new SettingsService();
