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

1. **Current Development**: Use OpenSpec documents in `openspec/specs/` for current development
2. **Authoritative Reference**: OpenSpec documents are the single source of truth
3. **New Implementations**: Always reference current OpenSpec specifications

### Metadata Fields

Each archived document includes metadata with the following fields:

- `document_id`: Unique identifier for the document
- `authority`: Always "historical" for archived documents
- `status`: Always "archived"
- `archived_date`: Date when document was archived
- `source`: Original source directory (e.g., "docs")
- `path`: Original path relative to docs/
- `migrated_to`: (Optional) Path to OpenSpec version if document was migrated
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

- [OpenSpec Specifications](../openspec/specs/) - Current authoritative documentation
- [Migration Tracking](../openspec/migration-tracking.md) - Document migration status
- [Archive Plan](../openspec/archive-plan.md) - Archive strategy and process

---

**Version**: 1.0.0  
**Created**: 2026-03-12  
**Last Updated**: 2026-03-12  
**Status**: Active  
**Owner**: Documentation Migration Team
