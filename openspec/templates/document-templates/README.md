---
document_id: openspec-templates-document-templates-README-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: templates/document-templates/README.md
tags: [authoritative, current, specification]
search_priority: high
---

# 文档模板库 (Document Templates Library)

## 概述

本目录包含HeartRule项目使用的各种文档模板，用于确保文档的一致性和完整性。

## 模板分类

### 1. 产品规格类 (Product Specifications)

- **product-specification-template.md** - 产品规格文档模板
  - 用途：定义新功能的产品需求
  - 语言：中文
  - 存放位置：`openspec/specs/product/`

### 2. DDD设计类 (DDD Design)

- **ddd-strategic-design-template.md** - DDD战略设计模板
  - 用途：领域战略设计文档
  - 语言：中文
  - 存放位置：`openspec/specs/domain/strategic/`

- **ddd-tactical-design-template.md** - DDD战术设计模板
  - 用途：领域战术设计文档
  - 语言：英文
  - 存放位置：`openspec/specs/domain/tactical/`

### 3. 架构设计类 (Architecture Design)

- **architecture-design-template.md** - 架构设计模板
  - 用途：系统架构设计文档
  - 语言：英文
  - 存放位置：`openspec/specs/architecture/`

### 4. 技术研究类 (Technical Research)

- **technical-research-template.md** - 技术研究模板
  - 用途：技术方案研究文档
  - 语言：英文
  - 存放位置：`openspec/specs/research/technical/`

### 5. AI研究类 (AI Research)

- **ai-research-template.md** - AI研究模板
  - 用途：AI实现机制研究文档
  - 语言：中文
  - 存放位置：`openspec/specs/research/ai-implementation/`

### 6. 流程规范类 (Process Documentation)

- **process-documentation-template.md** - 流程文档模板
  - 用途：开发流程和团队规范文档
  - 语言：中文
  - 存放位置：`openspec/specs/_global/process/`

## 使用指南

### 1. 选择模板

根据文档类型选择合适的模板：

- 产品需求 → `product-specification-template.md`
- 领域设计 → `ddd-strategic-design-template.md` 或 `ddd-tactical-design-template.md`
- 架构设计 → `architecture-design-template.md`
- 技术研究 → `technical-research-template.md`
- AI研究 → `ai-research-template.md`
- 流程规范 → `process-documentation-template.md`

### 2. 复制模板

```bash
# 示例：创建产品规格文档
cp openspec/templates/document-templates/product-specification-template.md \
   openspec/specs/product/new-feature-specification.md
```

### 3. 填写内容

按照模板中的提示填写内容：

1. 替换 `[占位符]` 为实际内容
2. 填写所有必填部分
3. 删除不适用部分
4. 添加具体细节

### 4. 保存位置

根据语言策略保存到正确目录：

- 中文文档 → 对应中文目录
- 英文文档 → 对应英文目录

## 模板结构说明

### 通用结构

所有模板都包含以下部分：

1. **概述** - 文档基本信息
2. **问题描述** - 要解决的问题
3. **目标** - 具体、可衡量的目标
4. **解决方案** - 详细解决方案
5. **实施计划** - 分阶段实施计划
6. **成功标准** - 验收标准
7. **风险与缓解** - 风险分析和应对措施
8. **附录** - 相关信息和参考资料

### 语言策略

- 中文模板：用于产品需求、战略设计、AI研究、流程规范
- 英文模板：用于架构设计、战术设计、技术研究

## 质量检查清单

创建文档后，请检查：

- [ ] 所有 `[占位符]` 已替换为实际内容
- [ ] 文档结构完整
- [ ] 内容准确无误
- [ ] 语言符合策略要求
- [ ] 链接有效
- [ ] 版本信息完整

## 维护指南

### 模板更新

1. 更新模板时，保持向后兼容
2. 添加新字段时，标记为可选
3. 删除字段时，提供迁移指南
4. 更新版本号

### 模板评审

1. 定期评审模板的有效性
2. 收集用户反馈
3. 根据实际使用情况优化

## 相关文档

- [语言策略指南](../language-strategy-guide.md)
- [OpenSpec工作流程速查表](../workflow-cheat-sheet.md)
- [开发流程规范](../../specs/_global/process/development-process.md)

## 版本历史

| 版本  | 日期       | 修改说明                  |
| ----- | ---------- | ------------------------- |
| 1.0.0 | 2026-03-12 | 初始版本，包含3个核心模板 |
| 1.0.1 | 2026-03-12 | 添加模板使用指南          |

---

**最后更新**: 2026-03-12  
**维护者**: HeartRule文档团队  
**状态**: ✅ 活跃维护中
