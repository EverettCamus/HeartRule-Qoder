---
document_id: 'docs-archive-misc-2026-03-11-document-restructure-design'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/plans/2026-03-11-document-restructure-design.md'
migrated_to: '' # 如果已迁移到openspec，填写openspec路径
tags: ['historical', 'reference', 'archived', 'misc']
search_priority: 'medium'
ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\`openspec/specs/\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: 2026-03-13
**原始路径**: docs/plans/2026-03-11-document-restructure-design.md

---

# 文档重组计划设计文档

**日期**: 2026-03-11  
**状态**: 草案  
**版本**: 1.0  
**作者**: HeartRule开发团队  
**相关文档**: [原始需求](#), [项目上下文分析](#)

## 1. 概述

### 1.1 背景

HeartRule AI咨询引擎项目目前存在多个文档源：

- `.qoder/repowiki/zh/` - 中文wiki文档
- `docs/` - 开发文档、bug修复记录、论文
- `openspec/` - OpenSpec规范目录（目前为空）
- 根目录的README.md、AGENTS.md等

文档结构分散，缺乏统一管理，影响团队协作和知识共享。

### 1.2 目标

1. 统一文档结构，采用OpenSpec规范
2. 支持DDD（领域驱动设计）文档化
3. 集成Scrum工作流
4. 支持中英文混合文档
5. 实现自动化验证和迁移

### 1.3 设计原则

- **渐进式改进**：不破坏现有工作流
- **自动化优先**：减少手动维护负担
- **多语言友好**：支持中英文混合内容
- **工具链集成**：与现有开发工具链集成

## 2. 架构设计

### 2.1 总体结构

采用混合方法：

- **OpenSpec核心**：用于技术规范和变更管理
- **DDD文档化**：集成到代码和轻量级文档
- **Scrum映射**：作为补充而非替代
- **渐进迁移**：分阶段实施

### 2.2 目录结构

```
docs/
├── README.md                          # 文档入口
├── .openspecrc                        # OpenSpec配置
├── specs/                             # OpenSpec规范
│   ├── product/                       # 产品需求
│   │   ├── epics/                     # 史诗级需求
│   │   ├── features/                  # 功能需求
│   │   └── stories/                   # 用户故事
│   ├── architecture/                  # 架构规范
│   │   ├── strategic/                 # 战略设计（DDD）
│   │   │   ├── bounded-contexts/      # 限界上下文
│   │   │   └── context-maps/          # 上下文映射
│   │   └── tactical/                  # 战术设计（DDD）
│   │       ├── aggregates/            # 聚合
│   │       ├── entities/              # 实体
│   │       └── value-objects/         # 值对象
│   └── technical/                     # 技术规范
│       ├── api/                       # API规范
│       ├── database/                  # 数据库设计
│       └── components/                # 组件规范
├── changes/                           # OpenSpec变更
│   ├── active/                        # 进行中的变更
│   ├── completed/                     # 已完成的变更
│   └── archive/                       # 归档的变更
├── guides/                            # 指南文档
│   ├── en/                            # 英文指南
│   │   ├── getting-started.md
│   │   ├── development.md
│   │   └── deployment.md
│   └── zh/                            # 中文指南
│       ├── 快速开始.md
│       ├── 开发指南.md
│       └── 部署指南.md
├── decisions/                         # 架构决策记录（ADR）
│   ├── 2024-01-01-monorepo-structure.md
│   └── 2024-01-02-ddd-adoption.md
├── api/                               # API文档
│   ├── reference/                     # API参考
│   └── examples/                      # API示例
└── legacy/                            # 旧文档（迁移期间）
    └── .qoder/                        # 原.qoder内容
```

## 3. OpenSpec规范实现

### 3.1 配置文件（.openspecrc）

```yaml
version: '1.0'
validation:
  enabled: true
  rules:
    - name: 'spec-structure'
      pattern: 'specs/**/*.md'
      schema: '.schemas/spec-schema.json'
    - name: 'change-format'
      pattern: 'changes/**/*.md'
      schema: '.schemas/change-schema.json'
templates:
  spec: '.templates/spec-template.md'
  change: '.templates/change-template.md'
  decision: '.templates/decision-template.md'
i18n:
  default_language: 'en'
  supported_languages: ['en', 'zh']
  translation_path: 'i18n/{lang}.json'
```

### 3.2 Spec模板

```markdown
---
id: 'spec-001'
title: '用户认证系统'
type: 'feature'
status: 'draft'
priority: 'high'
domain: 'authentication'
created: '2024-01-01'
updated: '2024-01-01'
owners: ['team-auth']
tags: ['security', 'user-management']
---

# 用户认证系统

## 业务需求

[描述业务需求...]

## 功能需求

1. [需求1...]
2. [需求2...]

## 验收标准

- [ ] 标准1
- [ ] 标准2

## 技术约束

- [约束1...]
- [约束2...]

## 相关文档

- [链接到相关文档...]
```

## 4. DDD文档化策略

### 4.1 战略设计

- **限界上下文图**：使用Mermaid在Markdown中嵌入
- **上下文映射**：表格形式记录关系
- **领域事件**：事件风暴结果文档化

### 4.2 战术设计

- **代码即文档**：TypeScript接口定义聚合、实体、值对象
- **测试即文档**：单元测试展示领域逻辑
- **架构决策记录**：记录关键设计决策

### 4.3 示例：限界上下文文档

```markdown
# 认证上下文（Authentication Context）

## 职责

- 用户身份验证
- 会话管理
- 权限验证

## 核心概念

- **用户（User）**：系统用户
- **会话（Session）**：用户会话
- **凭证（Credential）**：认证凭证

## 上下文映射

| 上下文   | 关系 | 协议     |
| -------- | ---- | -------- |
| 用户管理 | 上游 | REST API |
| 咨询引擎 | 下游 | 事件驱动 |

## 领域事件

- UserRegistered
- UserAuthenticated
- SessionCreated
- SessionExpired
```

## 5. Scrum与OpenSpec集成

### 5.1 映射关系

```
Scrum概念        → OpenSpec结构
─────────────────────────────────
产品待办事项列表  → specs/product/epics/
用户故事         → specs/product/stories/
冲刺目标         → changes/active/sprint-{id}/
任务             → 变更中的子任务
验收标准         → spec中的验收标准部分
```

### 5.2 工作流

1. **故事细化**：在`specs/product/stories/`创建spec
2. **冲刺规划**：创建`changes/active/sprint-{id}/`变更
3. **任务跟踪**：变更中的任务列表
4. **完成验证**：验证spec中的验收标准

## 6. 中英文混合文档策略

### 6.1 分层语言策略

1. **技术规范**：英文为主（代码、API、架构）
2. **用户指南**：中英双语（并行目录）
3. **团队文档**：根据团队偏好
4. **自动翻译**：关键文档提供机器翻译

### 6.2 翻译管理

- 英文为主版本，中文为翻译版本
- 使用翻译状态跟踪
- 自动化翻译检查

## 7. 迁移策略

### 7.1 四阶段迁移计划

**阶段1：分析和准备（1-2周）**

- 分析现有文档结构
- 设计新结构
- 创建迁移工具

**阶段2：核心迁移（2-3周）**

- 迁移高频访问文档
- 建立重定向规则
- 培训团队使用新结构

**阶段3：批量迁移（1-2周）**

- 自动化迁移剩余文档
- 验证链接完整性
- 清理旧结构

**阶段4：优化和自动化（持续）**

- 优化验证规则
- 完善自动化工具
- 收集反馈并迭代

### 7.2 迁移工具

```bash
# 迁移脚本示例
./scripts/migrate-docs.sh \
  --source .qoder/repowiki/zh \
  --target docs/guides/zh \
  --mapping mapping.json
```

## 8. 验证和自动化

### 8.1 验证规则

1. **结构验证**：目录结构符合规范
2. **内容验证**：必要元数据完整
3. **链接验证**：内部链接有效
4. **质量验证**：文档可读性检查

### 8.2 自动化工具链

```yaml
# GitHub Actions工作流示例
name: Document Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Validate OpenSpec structure
        run: npx openspec-validate
      - name: Check broken links
        run: npx markdown-link-check
      - name: Generate documentation report
        run: npx docs-report-generator
```

### 8.3 监控和报告

- **每日报告**：文档健康状态
- **质量指标**：完整性、新鲜度、可读性
- **团队仪表板**：可视化文档状态

## 9. 外部资源和最佳实践

### 9.1 OpenSpec资源

- [OpenSpec官方文档](https://openspec.dev)
- [OpenSpec GitHub仓库](https://github.com/openspec/openspec)
- [OpenSpec示例项目](https://github.com/openspec/examples)

### 9.2 DDD文档化资源

- [领域驱动设计模式](https://domainlanguage.com/ddd/)
- [DDD社区资源](https://dddcommunity.org/)
- [架构决策记录模式](https://adr.github.io/)

### 9.3 多语言文档资源

- [i18n最佳实践](https://www.w3.org/International/)
- [翻译管理工具](https://www.transifex.com/)
- [多语言SEO指南](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites)

### 9.4 文档自动化工具

- [Markdown lint工具](https://github.com/DavidAnson/markdownlint)
- [链接检查工具](https://github.com/tcort/markdown-link-check)
- [文档生成器](https://www.mkdocs.org/)

## 10. 潜在陷阱和缓解措施

### 10.1 技术陷阱

- **陷阱**：过度复杂的验证规则
- **缓解**：从简单规则开始，逐步增加复杂性

- **陷阱**：迁移过程中的链接断裂
- **缓解**：实现自动重定向和链接修复

### 10.2 组织陷阱

- **陷阱**：团队抵制新流程
- **缓解**：渐进式引入，提供培训和支持

- **陷阱**：文档维护负担增加
- **缓解**：自动化工具减少手动工作

### 10.3 维护陷阱

- **陷阱**：文档与代码不同步
- **缓解**：集成到CI/CD，代码变更触发文档更新

- **陷阱**：多语言内容不一致
- **缓解**：翻译状态跟踪和自动化检查

## 11. 成功标准

### 11.1 定量指标

- 文档完整性 ≥ 90%
- 链接有效性 ≥ 95%
- 文档新鲜度（最后更新 ≤ 30天）≥ 80%
- 团队采用率 ≥ 80%

### 11.2 定性指标

- 团队反馈积极
- 新成员上手时间减少
- 知识共享效率提高
- 决策透明度提升

## 12. 下一步行动

1. **评审设计**：团队评审本设计文档
2. **创建原型**：实现核心目录结构和验证工具
3. **试点迁移**：选择部分文档进行试点迁移
4. **团队培训**：培训团队使用新文档系统
5. **全面实施**：按迁移计划全面实施

## 附录

### A. 术语表

- **OpenSpec**：开放规范格式，用于技术规范和变更管理
- **DDD**：领域驱动设计，软件设计方法
- **ADR**：架构决策记录，记录关键设计决策
- **限界上下文**：DDD中定义明确边界的领域模型
- **上下文映射**：DDD中描述不同限界上下文关系的技术

### B. 相关文档

- [项目README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [开发指南](../DEVELOPMENT_GUIDE.md)

### C. 变更记录

| 日期       | 版本 | 变更描述 | 作者          |
| ---------- | ---- | -------- | ------------- |
| 2026-03-11 | 1.0  | 初始版本 | HeartRule团队 |
