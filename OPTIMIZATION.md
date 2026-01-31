
## Chunk 优化建议

### 1. 已配置的优化
- 将警告阈值提高到 1000KB
- 配置 manualChunks 将大型库分开打包：
  - vendor-react: React 核心库
  - vendor-ui: Ant Design
  - vendor-chart: 图表库 (recharts, mermaid, cytoscape)
  - vendor-pdf: PDF 生成库 (jspdf, html2canvas)
  - vendor-utils: 工具库 (lodash, moment, dayjs)

### 2. 动态导入大型组件
将不常用的组件改为动态导入：

```typescript
// 修改 src/components/Skill/index.ts
export { default as SkillCard } from './SkillCard';

// 大型组件改为动态导出
export const SkillManager = lazy(() => import('./SkillManager'));
export const SkillEditor = lazy(() => import('./SkillEditor'));
```

### 3. 移除未使用的依赖
检查并移除未使用的库：
- 如果只用部分 lodash 功能，改用 lodash-es + tree shaking
- 检查是否有重复的日期库 (moment/dayjs)

### 4. Gzip/Brotli 压缩
部署时启用服务器端压缩，可以大幅减少传输大小：
- gzip 压缩率约 70%
- Brotli 压缩率约 80%
