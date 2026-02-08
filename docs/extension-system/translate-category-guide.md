# Translate Category Usage Guide

## Overview

The Translate category is a professional Chinese-English translation tool with dual expertise in technology and finance. It is a non-strict mode category that contains no tools and is dedicated to pure translation services.

## 🎯 Design Philosophy

- **Pure Translation Functionality**: Only translates, never answers questions or provides explanations
- **Technology First**: Primary expertise is the full technology stack
- **Finance Supplement**: Financial knowledge as rich domain expert knowledge
- **Colloquial Expression**: Uses natural, authentic everyday language

## Features

### 🎯 **Core Functions**
- **Pure Translation Service**: Only translates, does not answer questions or provide explanations
- **Bidirectional Translation**: Chinese ↔ English
- **Colloquial Translation**: Uses natural, authentic everyday language
- **Financial Expertise**: Has professional terminology knowledge in finance and trading

### 💻 **Technology Stack Expertise** (Primary Domain)

#### Core Technology Stack
- **Java/Spring Boot**: microservices, REST API, dependency injection
- **Cloud Platforms**: GCP (Google Cloud Platform), AWS (Amazon Web Services), serverless
- **Rust**: memory safety, ownership, cargo

#### Messaging and Data
- **Messaging Systems**: Kafka, Solace, Pub/Sub
- **Data Engineering**: Dataflow, Airflow, ETL (Extract, Transform, Load)
- **Databases**: BigQuery, BigTable, MongoDB, PostgreSQL, Redis

#### Infrastructure
- **Infrastructure**: Terraform, Jenkins, CI/CD

### 💼 **Financial Expertise** (Supplementary Domain Knowledge)

#### Common Financial Abbreviations
- **P&L** (Profit & Loss), **ROI** (Return on Investment), **IPO** (Initial Public Offering), **M&A** (Mergers & Acquisitions)
- **PE/PB** (Price-to-Earnings/Price-to-Book), **ETF** (Exchange-Traded Fund)

#### Trading Terminology
- **long position**
- **short position**
- **bull market**
- **bear market**
- **bid/ask**
- **spread**
- **volume**
- **volatility**
- **support/resistance**
- **breakout/pullback**

## Usage Examples

### 📝 **General Translation**
```
User Input: "你好吗?"
Output: "How are you doing?"

User Input: "What time is it?"
Output: "现在几点了？"
```

### 💻 **Technical Translation** (Primary Scenario)
```
User Input: "微服务架构"
Output: "Microservices architecture"

User Input: "Deploy to GCP"
Output: "部署到GCP"

User Input: "BigQuery查询优化"
Output: "BigQuery query optimization"

User Input: "Redis cache hit rate"
Output: "Redis缓存命中率"

User Input: "Kafka consumer lag"
Output: "Kafka消费者延迟"

User Input: "Terraform infrastructure"
Output: "Terraform基础设施"
```

### 💰 **Financial Translation** (Supplementary Scenario)
```
User Input: "今天的P&L怎么样?"
Output: "How's today's P&L?"

User Input: "The market is bullish"
Output: "市场看涨"

User Input: "PE ratio is too high"
Output: "市盈率太高了"
```

## Important Rules

### ✅ **Will Do**
1. Translate Chinese to English
2. Translate English to Chinese
3. Use natural, colloquial expressions
4. Correctly handle financial terms and abbreviations
5. Maintain translation accuracy and authenticity

### ❌ **Will Not Do**
1. **Does not answer questions** - Even if the user asks a question, only translates the question itself
2. **Does not provide explanations** - Does not explain term meanings or background
3. **Does not engage in conversation** - Does not participate in any form of interaction
4. **Does not provide advice** - Does not give investment or trading advice
5. **Does not add extra information** - Only outputs translation results

## Technical Implementation

### Category Configuration
- **ID**: `translate`
- **Display Name**: `Translate`
- **Icon**: `🌐` (TranslationOutlined)
- **Strict Mode**: `false` (allows natural language interaction)
- **Priority**: `80` (medium-high priority)
- **Tool Count**: `0` (no tools needed)

### System Architecture
- Automatically registered using `auto_register_category!` macro
- Implements `Category` trait
- Parameterless constructor `new()`
- Supports enable/disable control

## Usage Scenarios

### 🎯 **Applicable Scenarios**
- Financial document translation
- Trading terminology conversion
- Investment report translation
- Financial news translation
- Daily Chinese-English translation

### 🚫 **Not Applicable Scenarios**
- Complex concepts requiring explanation
- Content requiring context analysis
- Questions requiring professional advice
- Scenarios requiring conversational interaction

## Notes

1. **Focus on Translation**: The sole purpose of this category is translation; do not expect it to do other things
2. **Finance First**: When encountering abbreviations or professional terms, they will be interpreted according to the financial domain first
3. **Colloquial**: Translation results will use natural, authentic expressions
4. **Literal Translation**: Strictly translates according to the original text without adding or omitting content

This translation category is particularly suitable for financial practitioners, traders, investors, and other users who frequently need Chinese-English translation.
