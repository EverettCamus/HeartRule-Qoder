# Documentation Archive

## Overview

This directory contains archived documentation from the old `docs/` directory structure. These documents are preserved for historical reference but are no longer actively maintained or considered authoritative.

## Archive Structure

```
docs-archive/
├── product/          # Archived product specifications
├── domain/           # Archived DDD designs
├── architecture/     # Archived architecture documents
├── research/         # Archived research papers
├── process/          # Archived process documentation
├── misc/             # Miscellaneous archived documents
├── bugfix/           # Bug fix records
├── test/             # Test reports
└── temp/             # Temporary documents
```

## Usage Guidelines

### When to Use Archived Documents

1. **Historical Context**: Understanding past design decisions or implementation approaches
2. **Reference**: Checking previous bug fixes or test results
3. **Research**: Reviewing historical research or analysis

### When NOT to Use Archived Documents

1. **Current Development**: 设计权威在 [`docs/design/`](../docs/design/README.md)（含 [`decisions/`](../docs/design/decisions/) ADR 注册表）——原 OpenSpec 方案已废弃，`openspec/` 目录不复存在
2. **Authoritative Reference**: `docs/design/` 是唯一设计真相源
3. **New Implementations**: 先查 `docs/design/` 现行文档与 ADR；本目录仅作历史参考。个别文档经人确认后复活至 `docs/design/`（复活文档带「演进注记」说明与现行设计的差异），档案副本保留作历史

### Metadata Fields

Each archived document includes metadata with the following fields:

- `document_id`: Unique identifier for the document
- `authority`: Always "historical" for archived documents
- `status`: Always "archived"
- `archived_date`: Date when document was archived
- `source`: Original source directory (e.g., "docs")
- `path`: Original path relative to docs/
- `migrated_to`: (Optional) 原 OpenSpec 迁移方案的遗留字段，已废弃——复活至 docs/design/ 的文档以复活文档的「演进注记」为准
- `tags`: Always includes "historical", "reference", "archived"
- `search_priority`: "medium" - lower priority than OpenSpec documents

## Archive Maintenance

### Review Schedule

- **Quarterly**: Check archive relevance and usage
- **Annual**: Remove truly obsolete documents
- **As-needed**: Update metadata as documents become obsolete

### Access Control

- **Development Team**: Full read access
- **New Team Members**: Read access with guidance on document relevance
- **External Contributors**: Limited access based on need

## Related Documents

- [设计文档状态索引](../docs/design/README.md) - 当前设计权威（含 ADR 注册表）
- [产品待办](../docs/scrum/backlog.md) - 故事关联列挂有本目录旧稿引用（历史参考用）

---

**Version**: 1.0.0  
**Created**: 2026-03-12  
**Last Updated**: 2026-03-12  
**Status**: Active  
**Owner**: Documentation Migration Team
