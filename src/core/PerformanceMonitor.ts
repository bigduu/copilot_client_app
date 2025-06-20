import {
  PerformanceMonitor as IPerformanceMonitor,
} from '../interfaces/chat-manager';

/**
 * 操作记录
 */
interface OperationRecord {
  name: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * 性能指标
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
 * 性能监控器
 * 性能追踪和监控
 */
export class PerformanceMonitor implements IPerformanceMonitor {
  private initialized = false;
  private operations: OperationRecord[] = [];
  private maxHistorySize = 1000;
  private startTime = Date.now();
  private metricsCache: PerformanceMetrics | null = null;
  private cacheExpiryTime = 0;
  private cacheValidityMs = 5000; // 缓存5秒有效

  constructor() {}

  /**
   * 追踪操作性能
   */
  trackOperation(operationName: string, duration: number): void {
    try {
      if (!this.initialized) {
        console.warn('PerformanceMonitor 未初始化，跳过追踪');
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
      console.error('追踪操作性能失败:', error);
    }
  }

  /**
   * 带性能追踪的操作执行
   */
  async withTracking<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    if (!this.initialized) {
      console.warn('PerformanceMonitor 未初始化，直接执行操作');
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
   * 记录操作性能
   */
  recordOperation(operation: string, duration: number): void {
    this.trackOperation(operation, duration);
  }

  /**
   * 获取性能指标
   */
  getMetrics(): Record<string, any> {
    try {
      // 检查缓存是否有效
      if (this.metricsCache && Date.now() < this.cacheExpiryTime) {
        return this.metricsCache;
      }

      // 计算新的指标
      const metrics = this.calculateMetrics();
      
      // 更新缓存
      this.metricsCache = metrics;
      this.cacheExpiryTime = Date.now() + this.cacheValidityMs;

      return metrics;
    } catch (error) {
      console.error('获取性能指标失败:', error);
      return this.getDefaultMetrics();
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 清理历史记录
      this.operations = [];
      
      // 重置缓存
      this.metricsCache = null;
      this.cacheExpiryTime = 0;
      
      // 记录启动时间
      this.startTime = Date.now();

      this.initialized = true;
      console.log('PerformanceMonitor 初始化完成');
    } catch (error) {
      throw new Error(`PerformanceMonitor 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 销毁
   */
  async dispose(): Promise<void> {
    try {
      // 清理数据
      this.operations = [];
      this.metricsCache = null;
      this.cacheExpiryTime = 0;
      
      this.initialized = false;
      console.log('PerformanceMonitor 已销毁');
    } catch (error) {
      console.error('PerformanceMonitor 销毁失败:', error);
    }
  }

  /**
   * 获取操作历史
   */
  getOperationHistory(): OperationRecord[] {
    return [...this.operations];
  }

  /**
   * 清理历史记录
   */
  clearHistory(): void {
    try {
      this.operations = [];
      this.metricsCache = null;
      this.cacheExpiryTime = 0;
      console.log('性能监控历史记录已清理');
    } catch (error) {
      console.error('清理历史记录失败:', error);
    }
  }

  /**
   * 设置最大历史记录数量
   */
  setMaxHistorySize(size: number): void {
    if (size <= 0) {
      throw new Error('历史记录大小必须大于0');
    }
    
    this.maxHistorySize = size;
    
    // 如果当前记录超过限制，截断
    if (this.operations.length > size) {
      this.operations = this.operations.slice(-size);
    }
  }

  /**
   * 获取运行时间
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取平均响应时间
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
      console.error('计算平均响应时间失败:', error);
      return 0;
    }
  }

  /**
   * 获取成功率
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
      console.error('计算成功率失败:', error);
      return 0;
    }
  }

  /**
   * 添加操作记录
   */
  private addOperationRecord(record: OperationRecord): void {
    this.operations.push(record);
    
    // 限制历史记录大小
    if (this.operations.length > this.maxHistorySize) {
      this.operations.shift();
    }

    // 清理缓存
    this.metricsCache = null;
  }

  /**
   * 计算性能指标
   */
  private calculateMetrics(): PerformanceMetrics {
    if (this.operations.length === 0) {
      return this.getDefaultMetrics();
    }

    const totalOperations = this.operations.length;
    const successfulOperations = this.operations.filter(op => op.success).length;
    const failedOperations = totalOperations - successfulOperations;

    // 计算持续时间统计
    const durations = this.operations.map(op => op.duration);
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    const averageDuration = totalDuration / totalOperations;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    // 按操作类型分组统计
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

    // 计算每种操作类型的指标
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

    // 获取最近的操作（最多10个）
    const recentOperations = this.operations.slice(-10);

    // 尝试获取内存使用情况
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
   * 获取默认指标
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
   * 获取内存使用情况
   */
  private getMemoryUsage(): { used: number; total: number; percentage: number } | undefined {
    try {
      // 在浏览器环境中，尝试使用 performance.memory API
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
      // 忽略内存获取错误
      return undefined;
    }
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): string {
    try {
      const metrics = this.getMetrics();
      const uptime = this.getUptime();
      
      let report = '=== 性能监控报告 ===\n';
      report += `运行时间: ${this.formatDuration(uptime)}\n`;
      report += `总操作数: ${metrics.totalOperations}\n`;
      report += `成功操作: ${metrics.successfulOperations}\n`;
      report += `失败操作: ${metrics.failedOperations}\n`;
      report += `平均响应时间: ${this.formatDuration(metrics.averageDuration)}\n`;
      report += `最快响应时间: ${this.formatDuration(metrics.minDuration)}\n`;
      report += `最慢响应时间: ${this.formatDuration(metrics.maxDuration)}\n`;
      
      if (metrics.memoryUsage) {
        report += `内存使用: ${(metrics.memoryUsage.used / 1024 / 1024).toFixed(2)}MB / ${(metrics.memoryUsage.total / 1024 / 1024).toFixed(2)}MB (${metrics.memoryUsage.percentage.toFixed(1)}%)\n`;
      }
      
      report += '\n操作类型统计:\n';
      for (const [name, stats] of Object.entries(metrics.operationsByType)) {
        const typeStats = stats as any;
        report += `  ${name}: ${typeStats.count}次, 平均${this.formatDuration(typeStats.averageDuration)}, 成功率${typeStats.successRate.toFixed(1)}%\n`;
      }
      
      return report;
    } catch (error) {
      console.error('生成性能报告失败:', error);
      return '性能报告生成失败';
    }
  }
}