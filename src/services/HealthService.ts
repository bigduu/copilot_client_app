import { buildBackendUrl } from '../utils/backendBaseUrl'

export interface HealthCheckResult {
  isHealthy: boolean
  error?: string
}

export class HealthService {
  private static instance: HealthService

  private constructor() {}

  static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService()
    }
    return HealthService.instance
  }

  async checkBackendHealth(timeoutMs = 5000): Promise<HealthCheckResult> {
    try {
      const response = await fetch(buildBackendUrl('/models'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        return {
          isHealthy: false,
          error: `Service responded with status ${response.status}`,
        }
      }

      return { isHealthy: true }
    } catch (error) {
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

export const healthService = HealthService.getInstance()
