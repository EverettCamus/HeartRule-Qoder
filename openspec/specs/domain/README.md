---
document_id: openspec-specs-domain-README-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: specs/domain/README.md
tags: [authoritative, current, specification]
search_priority: high
---

# 领域设计 (Domain Design)

## 目录结构

此目录遵循领域驱动设计(DDD)方法论，分为战略设计和战术设计：

### 战略设计 (Strategic Design)

- **限界上下文 (Bounded Contexts)**: 定义领域边界和上下文映射
- **上下文映射 (Context Mapping)**: 描述不同限界上下文之间的关系
- **通用语言 (Ubiquitous Language)**: 领域术语定义和统一

### 战术设计 (Tactical Design)

- **聚合 (Aggregates)**: 领域对象的聚合根和边界
- **实体 (Entities)**: 具有唯一标识的领域对象
- **值对象 (Value Objects)**: 不可变的领域对象
- **领域服务 (Domain Services)**: 领域逻辑服务
- **领域事件 (Domain Events)**: 领域状态变化事件

## 语言策略

- 战略设计：中文（便于团队沟通）
- 战术设计：英文（便于技术实现和代码对应）

## 文件命名规范

- `strategic/bounded-context-{名称}.md` - 限界上下文定义
- `strategic/context-mapping.md` - 上下文映射图
- `tactical/aggregate-{名称}.md` - 聚合设计
- `tactical/entity-{名称}.md` - 实体设计
