import { buildBackendUrl } from "../utils/backendBaseUrl";

export interface UserPreferencesDTO {
  last_opened_chat_id?: string | null;
  auto_generate_titles?: boolean;
}

export class UserPreferenceService {
  private async request<T>(options: RequestInit): Promise<T> {
    const response = await fetch(buildBackendUrl("/user/preferences"), {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `UserPreferenceService error: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return {} as T;
  }

  async getPreferences(): Promise<UserPreferencesDTO> {
    return this.request<UserPreferencesDTO>({ method: "GET" });
  }

  async updatePreferences(
    preferences: UserPreferencesDTO,
  ): Promise<UserPreferencesDTO> {
    return this.request<UserPreferencesDTO>({
      method: "PUT",
      body: JSON.stringify(preferences),
    });
  }
}
