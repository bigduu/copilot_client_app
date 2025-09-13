import {
  PerformanceMonitor as IPerformanceMonitor,
} from '../interfaces/chat-manager';

/**
 * Operation Record
 */
interface OperationRecord {
  name: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Performance Metrics
 */
interface PerformanceMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  operationsByType: Record<string, {
    count: number;
    totalDuration: number;
    averageDuration: number;
    successRate: number;
  }>;
  recentOperations: OperationRecord[];
  memoryUsage?: {
    used: number;
    total: number;
    percentage: number;
  };
}

/**
 * Performance Monitor
 * Performance tracking and monitoring
 */
export class PerformanceMonitor implements IPerformanceMonitor {
  private initialized = false;
  private operations: OperationRecord[] = [];
  private maxHistorySize = 1000;
  private startTime = Date.now();
  private metricsCache: PerformanceMetrics | null = null;
  private cacheExpiryTime = 0;
  private cacheValidityMs = 5000; // Cache is valid for 5 seconds

  constructor() {}

  /**
   * Track operation performance
   */
  trackOperation(operationName: string, duration: number): void {
    try {
      if (!this.initialized) {
        console.warn('PerformanceMonitor is not initialized, skipping tracking');
        return;
      }

      const record: OperationRecord = {
        name: operationName,
        duration,
        timestamp: Date.now(),
        success: true
      };

      this.addOperationRecord(record);
    } catch (error) {
      console.error('Failed to track operation performance:', error);
    }
  }

  /**
   * Execute operation with performance tracking
   */
  async withTracking<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    if (!this.initialized) {
      console.warn('PerformanceMonitor is not initialized, executing operation directly');
      return await operation();
    }

    const startTime = performance.now();
    let success = false;
    let error: string | undefined;

    try {
      const result = await operation();
      success = true;
      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const duration = performance.now() - startTime;
      
      const record: OperationRecord = {
        name: operationName,
        duration,
        timestamp: Date.now(),
        success,
        error
      };

      this.addOperationRecord(record);
    }
  }

  /**
   * Record operation performance
   */
  recordOperation(operation: string, duration: number): void {
    this.trackOperation(operation, duration);
  }

  /**
   * Get Performance Metrics
   */
  getMetrics(): Record<string, any> {
    try {
      // Check if cache is valid
      if (this.metricsCache && Date.now() < this.cacheExpiryTime) {
        return this.metricsCache;
      }

      // Calculate new metrics
      const metrics = this.calculateMetrics();
      
      // Update cache
      this.metricsCache = metrics;
      this.cacheExpiryTime = Date.now() + this.cacheValidityMs;

      return metrics;
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return this.getDefaultMetrics();
    }
  }

  /**
   * Initialize
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Clear history
      this.operations = [];
      
      // Reset cache
      this.metricsCache = null;
      this.cacheExpiryTime = 0;
      
      // Record start time
      this.startTime = Date.now();

      this.initialized = true;
      console.log('PerformanceMonitor initialized successfully');
    } catch (error) {
      throw new Error(`PerformanceMonitor initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Dispose
   */
  async dispose(): Promise<void> {
    try {
      // Clear data
      this.operations = [];
      this.metricsCache = null;
      this.cacheExpiryTime = 0;
      
      this.initialized = false;
      console.log('PerformanceMonitor has been disposed');
    } catch (error) {
      console.error('PerformanceMonitor disposal failed:', error);
    }
  }

  /**
   * Get operation history
   */
  getOperationHistory(): OperationRecord[] {
    return [...this.operations];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    try {
      this.operations = [];
      this.metricsCache = null;
      this.cacheExpiryTime = 0;
      console.log('Performance monitoring history has been cleared');
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }

  /**
   * Set maximum history size
   */
  setMaxHistorySize(size: number): void {
    if (size <= 0) {
      throw new Error('History size must be greater than 0');
    }
    
    this.maxHistorySize = size;
    
    // If current records exceed the limit, truncate
    if (this.operations.length > size) {
      this.operations = this.operations.slice(-size);
    }
  }

  /**
   * Get uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get average response time
   */
  getAverageResponseTime(operationName?: string): number {
    try {
      let relevantOps = this.operations;
      
      if (operationName) {
        relevantOps = this.operations.filter(op => op.name === operationName);
      }

      if (relevantOps.length === 0) {
        return 0;
      }

      const totalDuration = relevantOps.reduce((sum, op) => sum + op.duration, 0);
      return totalDuration / relevantOps.length;
    } catch (error) {
      console.error('Failed to calculate average response time:', error);
      return 0;
    }
  }

  /**
   * Get success rate
   */
  getSuccessRate(operationName?: string): number {
    try {
      let relevantOps = this.operations;
      
      if (operationName) {
        relevantOps = this.operations.filter(op => op.name === operationName);
      }

      if (relevantOps.length === 0) {
        return 0;
      }

      const successfulOps = relevantOps.filter(op => op.success).length;
      return (successfulOps / relevantOps.length) * 100;
    } catch (error) {
      console.error('Failed to calculate success rate:', error);
      return 0;
    }
  }

  /**
   * Add Operation Record
   */
  private addOperationRecord(record: OperationRecord): void {
    this.operations.push(record);
    
    // Limit history size
    if (this.operations.length > this.maxHistorySize) {
      this.operations.shift();
    }

    // Clear cache
    this.metricsCache = null;
  }

  /**
   * Calculate Performance Metrics
   */
  private calculateMetrics(): PerformanceMetrics {
    if (this.operations.length === 0) {
      return this.getDefaultMetrics();
    }

    const totalOperations = this.operations.length;
    const successfulOperations = this.operations.filter(op => op.success).length;
    const failedOperations = totalOperations - successfulOperations;

    // Calculate duration statistics
    const durations = this.operations.map(op => op.duration);
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    const averageDuration = totalDuration / totalOperations;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    // Group statistics by operation type
    const operationsByType: Record<string, any> = {};
    
    for (const op of this.operations) {
      if (!operationsByType[op.name]) {
        operationsByType[op.name] = {
          operations: [],
          count: 0,
          totalDuration: 0,
          successCount: 0
        };
      }
      
      operationsByType[op.name].operations.push(op);
      operationsByType[op.name].count++;
      operationsByType[op.name].totalDuration += op.duration;
      
      if (op.success) {
        operationsByType[op.name].successCount++;
      }
    }

    // Calculate metrics for each operation type
    const processedOperationsByType: Record<string, any> = {};
    
    for (const [name, data] of Object.entries(operationsByType)) {
      const typeData = data as any;
      processedOperationsByType[name] = {
        count: typeData.count,
        totalDuration: typeData.totalDuration,
        averageDuration: typeData.totalDuration / typeData.count,
        successRate: (typeData.successCount / typeData.count) * 100
      };
    }

    // Get recent operations (up to 10)
    const recentOperations = this.operations.slice(-10);

    // Try to get memory usage
    const memoryUsage = this.getMemoryUsage();

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageDuration,
      minDuration,
      maxDuration,
      operationsByType: processedOperationsByType,
      recentOperations,
      memoryUsage
    };
  }

  /**
   * Get default metrics
   */
  private getDefaultMetrics(): PerformanceMetrics {
    return {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      operationsByType: {},
      recentOperations: []
    };
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): { used: number; total: number; percentage: number } | undefined {
    try {
      // In a browser environment, try to use the performance.memory API
      if (typeof performance !== 'undefined' && 'memory' in performance) {
        const memory = (performance as any).memory;
        return {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
        };
      }
      
      return undefined;
    } catch (error) {
      // Ignore memory fetch errors
      return undefined;
    }
  }

  /**
   * Format duration
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): string {
    try {
      const metrics = this.getMetrics();
      const uptime = this.getUptime();
      
      let report = '=== Performance Monitoring Report ===\n';
      report += `Uptime: ${this.formatDuration(uptime)}\n`;
      report += `Total Operations: ${metrics.totalOperations}\n`;
      report += `Successful Operations: ${metrics.successfulOperations}\n`;
      report += `Failed Operations: ${metrics.failedOperations}\n`;
      report += `Average Response Time: ${this.formatDuration(metrics.averageDuration)}\n`;
      report += `Fastest Response Time: ${this.formatDuration(metrics.minDuration)}\n`;
      report += `Slowest Response Time: ${this.formatDuration(metrics.maxDuration)}\n`;
      
      if (metrics.memoryUsage) {
        report += `Memory Usage: ${(metrics.memoryUsage.used / 1024 / 1024).toFixed(2)}MB / ${(metrics.memoryUsage.total / 1024 / 1024).toFixed(2)}MB (${metrics.memoryUsage.percentage.toFixed(1)}%)\n`;
      }
      
      report += '\nOperation Type Statistics:\n';
      for (const [name, stats] of Object.entries(metrics.operationsByType)) {
        const typeStats = stats as any;
        report += `  ${name}: ${typeStats.count} times, avg ${this.formatDuration(typeStats.averageDuration)}, success rate ${typeStats.successRate.toFixed(1)}%\n`;
      }
      
      return report;
    } catch (error) {
      console.error('Failed to generate performance report:', error);
      return 'Failed to generate performance report';
    }
  }
}
