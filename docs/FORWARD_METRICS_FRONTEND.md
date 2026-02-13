# 前端转发 Metrics 功能实现总结

## 实现内容

### 1. 类型定义 (src/services/metrics/types.ts)

添加了转发 metrics 的 TypeScript 类型：

- **`ForwardStatus`**: 转发状态枚举 (success | error)
- **`ForwardMetricsSummary`**: 转发 metrics 汇总
  - total_requests, successful_requests, failed_requests
  - total_tokens, avg_duration_ms
- **`ForwardEndpointMetrics`**: 按 endpoint 分组的 metrics
- **`ForwardRequestMetrics`**: 单个转发请求的详细 metrics
- **`ForwardMetricsQuery`**: 查询过滤器

### 2. API 服务 (src/services/metrics/MetricsService.ts)

在 MetricsService 类中添加了三个新方法：

```typescript
async getForwardSummary(query: ForwardMetricsQuery): Promise<ForwardMetricsSummary>
async getForwardByEndpoint(query: ForwardMetricsQuery): Promise<ForwardEndpointMetrics[]>
async getForwardRequests(query: ForwardMetricsQuery): Promise<ForwardRequestMetrics[]>
```

### 3. React Hook (hooks/useForwardMetrics.ts)

创建了 `useForwardMetrics` hook，提供：

- **状态管理**: summary, endpointMetrics, requests
- **加载状态**: isLoading, isRefreshing
- **错误处理**: error
- **自动刷新**: refresh()

特性：
- 自动刷新（默认 15 秒）
- 支持过滤参数
- 统一的错误处理

### 4. UI 组件

#### ForwardMetricsCards.tsx
展示转发 metrics 的关键指标卡片：
- 总转发请求数
- 成功率（带颜色编码）
- 总 Token 使用量
- 平均响应时间

#### ForwardEndpointDistribution.tsx
使用柱状图展示不同 endpoint 的分布：
- 成功请求数（绿色）
- 失败请求数（红色）
- 使用 Recharts 库绘制

#### ForwardRequestTable.tsx
展示最近的转发请求列表：
- 请求 ID、Endpoint、Model、Type
- 状态和状态码
- Token 使用量
- 持续时间
- 开始时间
- 错误信息（如有）

特性：
- 分页支持
- 可调整每页显示数量
- 水平滚动支持
- 复制请求 ID

### 5. 集成到主页面 (SystemSettingsMetricsTab.tsx)

在 System Settings 的 Metrics 标签页中添加了新的 section：

```
[现有 Agent Metrics]
  ├── Metric Cards
  ├── Token Chart
  ├── Model Distribution
  ├── Tool Usage
  └── Daily Activity

[新增 Forward Metrics Section]
  ├── Forward Metrics Cards
  ├── Endpoint Distribution Chart
  └── Recent Forward Requests Table
```

## 功能特性

### 数据展示

1. **汇总统计卡片**
   - 总请求数实时更新
   - 成功率颜色编码（≥95% 绿色，≥80% 黄色，<80% 红色）
   - 平均响应时间格式化

2. **Endpoint 分布图表**
   - 可视化成功/失败对比
   - 自动截取 endpoint 名称简化显示

3. **请求详情表格**
   - 完整的请求信息
   - 支持分页和排序
   - 错误信息展示

### 交互功能

1. **过滤和刷新**
   - 与 Agent Metrics 共享日期范围过滤器
   - 统一的刷新按钮
   - 自动刷新（15 秒间隔）

2. **响应式设计**
   - 卡片网格自适应屏幕大小
   - 表格支持水平滚动
   - 移动端友好的布局

## 使用方法

1. 打开应用，进入 Settings 页面
2. 切换到 System Settings 标签
3. 选择 Metrics 子标签
4. 滚动到 "Forward Metrics" 部分

### 过滤数据

使用顶部的过滤器：
- **Start/End Date**: 选择日期范围
- **Model**: 过滤特定模型
- **Days**: 选择时间跨度
- **Granularity**: 选择时间粒度

### 查看详情

- 在 **Endpoint Distribution** 图表中查看各 endpoint 的请求分布
- 在 **Recent Forward Requests** 表格中查看详细请求信息
- 点击刷新按钮手动更新数据

## 数据流

```
用户交互 (过滤/刷新)
    ↓
useForwardMetrics hook
    ↓
metricsService.getForwardSummary()
metricsService.getForwardByEndpoint()
metricsService.getForwardRequests()
    ↓
API 请求 (GET /api/v1/metrics/forward/*)
    ↓
Rust Backend (agent-server)
    ↓
SQLite 数据库查询
    ↓
返回 JSON 数据
    ↓
React 组件渲染
```

## 样式和主题

- 使用 Ant Design 5 组件库
- 支持深色/浅色主题
- 响应式布局适配
- 统一的设计语言

## 性能优化

1. **数据缓存**: Hook 内部状态管理避免重复请求
2. **并行请求**: 使用 Promise.all 同时获取三组数据
3. **懒加载**: 表格分页减少渲染负担
4. **虚拟滚动**: 使用 Ant Design Table 内置优化

## 测试建议

1. **功能测试**
   - 验证所有指标正确显示
   - 测试过滤器功能
   - 检查自动刷新

2. **边界测试**
   - 无数据时的显示
   - 大量数据的分页
   - 错误情况的处理

3. **性能测试**
   - 大量请求时的渲染性能
   - 频繁刷新的资源占用

## 后续改进建议

1. **导出功能**: 添加导出 CSV/Excel 功能
2. **实时推送**: 使用 WebSocket 实现真正的实时更新
3. **更多图表**: 添加趋势图、饼图等可视化
4. **详情弹窗**: 点击请求查看完整详情
5. **搜索过滤**: 在表格中添加搜索和高级过滤
6. **性能指标**: 添加 P95、P99 延迟统计
7. **告警规则**: 设置阈值触发告警
