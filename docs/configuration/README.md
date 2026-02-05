# 配置文档

本目录包含项目配置相关的文档，涵盖系统提示词、技术栈配置、服务配置等。

## 📋 文档列表

### 系统配置
- [`updated-prompts-review.md`](./updated-prompts-review.md) - 系统提示词审查和更新
- [`final-tech-stack-update.md`](./final-tech-stack-update.md) - 最终技术栈更新总结

### 服务配置
- [`DEFAULT_OPENAI_MODE.md`](./DEFAULT_OPENAI_MODE.md) - 默认 OpenAI 模式配置
- [`DUAL_SERVICE_README.md`](./DUAL_SERVICE_README.md) - 双服务配置说明

## 🎯 配置概览

### 技术栈配置
- **主要技术**: Java/Spring Boot, GCP/AWS, Rust, Kafka/Solace
- **数据存储**: BigQuery, BigTable, MongoDB, PostgreSQL, Redis
- **基础设施**: Terraform, Jenkins CI/CD, Docker/Kubernetes
- **金融领域**: 作为丰富的领域专家知识

### 系统提示词
- **General Assistant**: 技术专家 + 架构师视角
- **Translate**: 技术+金融双重专业知识
- **Categories**: 按功能和优先级组织

### 服务配置
- **OpenAI 服务**: 默认模式和配置
- **双服务架构**: 支持多个 AI 服务提供商
- **环境变量**: 灵活的配置管理

## 🔧 配置管理

### 环境变量
```bash
# 技术栈相关
API_BASE_URL=https://api.example.com
SERVICE_URL=http://localhost:8080
DEBUG_MODE=true

# 公司内部功能
COMPANY_INTERNAL=true
```

### 配置文件
- `tauri.conf.json` - Tauri 应用配置
- 环境特定配置文件

## 📖 使用指南

### 更新系统提示词
1. 修改相应的 category 文件
2. 更新 `system_prompt` 字段
3. 重新编译和测试

### 添加新技术栈
1. 更新 General Assistant 的技术专业知识
2. 更新 Translate 的术语翻译能力
3. 更新相关文档

### 配置新服务
1. 添加环境变量配置
2. 更新服务初始化逻辑
3. 测试服务连接和功能

## 🎨 提示词设计原则

### General Assistant
- **技术为主**: 完整的技术栈专业知识
- **架构视角**: 系统设计和技术领导能力
- **快速上手**: 能够快速理解需求并提供解决方案

### Translate
- **纯翻译**: 只翻译，不回答问题
- **技术专业**: 优先按技术领域理解术语
- **口语化**: 使用自然、地道的表达

## 🔗 相关文档

- [扩展系统](../extension-system/) - 工具和类别的注册配置
- [架构文档](../architecture/) - 系统整体架构设计
- [开发指南](../development/) - 开发规范和配置
