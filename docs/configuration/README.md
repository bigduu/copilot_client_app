# Configuration Documentation

This directory contains project configuration documentation, covering system prompts, tech stack configuration, service configuration, etc.

## 📋 Document List

### System Configuration
- [`updated-prompts-review.md`](./updated-prompts-review.md) - System prompt review and updates
- [`final-tech-stack-update.md`](./final-tech-stack-update.md) - Final tech stack update summary

### Service Configuration
- [`DEFAULT_OPENAI_MODE.md`](./DEFAULT_OPENAI_MODE.md) - Default OpenAI mode configuration
- [`DUAL_SERVICE_README.md`](./DUAL_SERVICE_README.md) - Dual service configuration guide

## 🎯 Configuration Overview

### Tech Stack Configuration
- **Primary Technologies**: Java/Spring Boot, GCP/AWS, Rust, Kafka/Solace
- **Data Storage**: BigQuery, BigTable, MongoDB, PostgreSQL, Redis
- **Infrastructure**: Terraform, Jenkins CI/CD, Docker/Kubernetes
- **Financial Domain**: As rich domain expert knowledge

### System Prompts
- **General Assistant**: Technical expert + architect perspective
- **Translate**: Technical + financial dual expertise
- **Categories**: Organized by function and priority

### Service Configuration
- **OpenAI Service**: Default mode and configuration
- **Dual Service Architecture**: Support for multiple AI service providers
- **Environment Variables**: Flexible configuration management

## 🔧 Configuration Management

### Environment Variables
```bash
# Tech stack related
API_BASE_URL=https://api.example.com
SERVICE_URL=http://localhost:8080
DEBUG_MODE=true

# Company internal features
COMPANY_INTERNAL=true
```

### Configuration Files
- `tauri.conf.json` - Tauri application configuration
- Environment-specific configuration files

## 📖 Usage Guide

### Updating System Prompts
1. Modify the corresponding category file
2. Update the `system_prompt` field
3. Recompile and test

### Adding New Tech Stack
1. Update General Assistant's technical expertise
2. Update Translate's terminology translation capability
3. Update related documentation

### Configuring New Services
1. Add environment variable configuration
2. Update service initialization logic
3. Test service connection and functionality

## 🎨 Prompt Design Principles

### General Assistant
- **Technology Focused**: Complete tech stack expertise
- **Architecture Perspective**: System design and technical leadership capability
- **Quick Onboarding**: Ability to quickly understand requirements and provide solutions

### Translate
- **Pure Translation**: Translate only, don't answer questions
- **Technical Professional**: Prioritize understanding terminology by technical domain
- **Colloquial**: Use natural, authentic expressions

## 🔗 Related Documentation

- [Extension System](../extension-system/) - Tool and category registration configuration
- [Architecture Docs](../architecture/) - System overall architecture design
- [Development Guide](../development/) - Development standards and configuration
