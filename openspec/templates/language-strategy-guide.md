---
document_id: openspec-templates-language-strategy-guide-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: templates/language-strategy-guide.md
tags: [authoritative, current, specification]
search_priority: high
---

# 语言策略指南 (Language Strategy Guide)

## 概述

本指南定义了HeartRule项目中OpenSpec文档的语言使用策略，确保文档的一致性和可读性。

## 核心原则

### 1. 按文档类型选择语言

- **产品规格 (Product Specifications)**: 中文 - 便于团队沟通和理解需求
- **领域战略设计 (DDD Strategic Design)**: 中文 - 便于团队对齐领域概念
- **领域战术设计 (DDD Tactical Design)**: 英文 - 便于技术实现和代码对应
- **架构设计 (Architecture Design)**: 英文 - 便于参考国际技术文档
- **AI实现研究 (AI Implementation Research)**: 中文 - 便于团队理解和应用
- **技术研究 (Technical Research)**: 英文 - 便于参考国际技术文档
- **开发流程 (Development Process)**: 中文 - 确保团队所有成员清晰理解流程
- **变更设计文档 (Change Design Documents)**: 英文 - 便于技术评审
- **变更任务文档 (Change Task Documents)**: 英文 - 便于实现清晰度

### 2. 语言一致性规则

- 单个文档内保持语言一致
- 避免中英文混合使用
- 技术术语保持原语言（不翻译）
- 专有名词保持一致性

### 3. 翻译策略

- 核心概念提供中英文对照表
- 技术文档中的代码示例保持英文
- 用户界面文本根据目标用户选择语言

## 目录结构语言映射

| 目录路径                            | 主要语言 | 说明                                |
| ----------------------------------- | -------- | ----------------------------------- |
| `specs/product/`                    | 中文     | 产品待办列表、用户故事、验收标准    |
| `specs/domain/strategic/`           | 中文     | 限界上下文、上下文映射、通用语言    |
| `specs/domain/tactical/`            | 英文     | 聚合、实体、值对象、领域服务        |
| `specs/architecture/`               | 英文     | 架构决策记录、系统架构图、技术选型  |
| `specs/research/ai-implementation/` | 中文     | LLM集成、Prompt工程、AI代理模式     |
| `specs/research/technical/`         | 英文     | 框架评估、性能优化、安全研究        |
| `specs/_global/process/`            | 中文     | Scrum流程、OpenSpec工作流、团队协作 |
| `changes/*/design.md`               | 英文     | 变更设计文档、技术方案              |
| `changes/*/tasks.md`                | 英文     | 变更任务列表、实现步骤              |

## 模板示例

### 中文文档模板 (Chinese Document Template)

````markdown
# 文档标题 (Document Title)

## 概述 (Overview)

[中文内容...]

## 详细说明 (Detailed Description)

[中文内容...]

## 技术细节 (Technical Details)

```python
# 代码示例保持英文 (Code examples remain in English)
def example_function():
    return "Hello World"
```
````

## 参考资料 (References)

- [英文参考资料链接] (English reference links)
- [中文参考资料链接] (Chinese reference links)

````

### 英文文档模板 (English Document Template)
```markdown
# Document Title

## Overview
[English content...]

## Detailed Description
[English content...]

## Technical Details
```python
# Code examples in English
def example_function():
    return "Hello World"
````

## References

- [English reference links]
- [Chinese reference links with translation notes]

````

## 验证规则

### 自动化检查
项目包含自动化语言检查脚本，验证以下规则：
1. 目录语言合规性
2. 文档内语言一致性
3. 技术术语正确性
4. 翻译质量

### 手动检查清单
在提交文档前检查：
- [ ] 文档语言符合目录要求
- [ ] 技术术语使用正确
- [ ] 没有不必要的语言混合
- [ ] 代码示例语言正确
- [ ] 参考资料链接适当

## 工具支持

### 编辑器配置
- VS Code语言检查插件
- Markdown lint规则
- 拼写检查词典

### 自动化脚本
```bash
# 检查语言合规性
./scripts/check-language-compliance.sh

# 生成语言报告
./scripts/generate-language-report.sh
````

## 常见问题

### Q: 技术文档是否必须全部英文？

A: 不是。根据文档类型和受众选择语言。技术实现文档建议英文，团队内部文档建议中文。

### Q: 代码注释使用什么语言？

A: 代码注释建议使用英文，便于国际协作。关键业务逻辑可添加中文注释说明。

### Q: 如何处理中英文混合的技术术语？

A: 首次出现时提供中英文对照，后续使用统一术语。

## 更新记录

- 2026-03-11: 创建初始版本
- 版本: 1.0.0

## 联系方式

如有语言策略问题，请联系文档维护团队。
