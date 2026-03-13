# Documentation Archive Plan

## Overview

This document outlines the plan for archiving the old `docs/` directory structure after migration to OpenSpec. The goal is to preserve historical documents while clearly marking them as archived reference material.

## Archive Strategy

### 1. Phased Archive Approach

```
Phase 1: Analysis and Classification (Current)
Phase 2: Create Archive Structure
Phase 3: Move Documents to Archive
Phase 4: Update References
Phase 5: Validation and Cleanup
```

### 2. Archive Location

```
docs-archive/
├── README.md                    # Archive overview and usage guidelines
├── product/                     # Archived product specifications
├── domain/                      # Archived DDD designs
├── architecture/                # Archived architecture documents
├── research/                    # Archived research papers
├── process/                     # Archived process documentation
└── misc/                        # Miscellaneous archived documents
```

## Document Classification

### Documents to Archive

| Category                | Criteria                                                    | Example Files                 |
| ----------------------- | ----------------------------------------------------------- | ----------------------------- |
| **Research Papers**     | Academic/research papers not needed for current development | `papers/paper-*.md`           |
| **Bug Fix Records**     | Specific bug fixes with limited current relevance           | `bugfix/*.md`                 |
| **Historical Designs**  | Old design documents superseded by OpenSpec versions        | `design/thinking/*.md` (some) |
| **Temporary Documents** | Scratch/临时 documents                                      | `temp/*.md`                   |
| **Test Reports**        | Old test reports                                            | `test/*.md`                   |

### Documents to Keep in docs/

| Category                | Criteria                        | Reason                    |
| ----------------------- | ------------------------------- | ------------------------- |
| **Active Research**     | Current AI/technical research   | Still actively referenced |
| **Planning Documents**  | Current/future plans            | Active development use    |
| **Reference Materials** | Frequently referenced documents | Team needs access         |

## Archive Process

### Step 1: Inventory Creation

```bash
# Generate complete inventory of docs/ files
./openspec/scripts/generate-migration-inventory.sh

# Analyze file usage and references
./openspec/scripts/analyze-document-usage.sh
```

### Step 2: Create Archive Structure

```bash
# Create archive directory structure
mkdir -p docs-archive/{product,domain,architecture,research,process,misc}

# Create archive README
cp openspec/templates/archive-readme-template.md docs-archive/README.md
```

### Step 3: Move Documents to Archive

```bash
# Move research papers
mv docs/papers/*.md docs-archive/research/

# Move bug fix records
mv docs/bugfix/*.md docs-archive/misc/bugfix/

# Move historical designs
mv docs/design/thinking/*.md docs-archive/domain/historical-designs/

# Add archive metadata to each file
./openspec/scripts/add-archive-metadata.sh docs-archive/
```

### Step 4: Update References

```bash
# Update project documentation references
./openspec/scripts/update-document-references.sh

# Create symbolic links for critical documents
ln -s ../docs-archive/research/paper-01.md docs/references/paper-01.md
```

### Step 5: Validation

```bash
# Run validation scripts
./openspec/scripts/validate-migration.sh
./openspec/scripts/automated-checks.sh

# Check for broken links
./openspec/scripts/check-broken-links.sh
```

## Archive Metadata

### File-Level Metadata

Each archived file will include:

```markdown
---
archive: true
archive_date: 2026-03-12
original_path: docs/papers/paper-01.md
migrated_to: openspec/specs/research/ai-implementation/paper-01.md
status: archived
purpose: historical_reference
---
```

### Directory-Level Metadata

Each archive directory will include:

- `README.md` explaining the directory contents
- `index.json` with file inventory and metadata
- `usage-guidelines.md` explaining how to use archived documents

## Access Control

### Read Access

- **Development Team**: Full read access to all archived documents
- **New Team Members**: Read access with guidance on document relevance
- **External Contributors**: Limited access based on need

### Write Access

- **Archivists Only**: Only documentation team can modify archived documents
- **Read-Only for Others**: All other team members have read-only access

## Maintenance Plan

### Regular Reviews

- **Quarterly Review**: Check archive relevance and usage
- **Annual Cleanup**: Remove truly obsolete documents
- **As-needed Updates**: Update metadata as documents become obsolete

### Usage Monitoring

- Track document access patterns
- Monitor broken link reports
- Collect team feedback on archive usefulness

## Risk Mitigation

### Risks

1. **Lost Context**: Archived documents lose their context
2. **Broken Links**: References to archived documents break
3. **Access Issues**: Team can't find needed historical documents
4. **Storage Bloat**: Archive grows without control

### Mitigation Strategies

1. **Rich Metadata**: Preserve context through comprehensive metadata
2. **Link Management**: Maintain symbolic links and redirects
3. **Search Optimization**: Ensure archived documents are searchable
4. **Size Limits**: Implement archive size limits and cleanup policies

## Success Criteria

### Quantitative Metrics

- [ ] 80% reduction in active docs/ directory size
- [ ] 0 broken links after archive completion
- [ ] 95% team satisfaction with archive accessibility
- [ ] Archive size under 100MB

### Qualitative Metrics

- Improved findability of current documents
- Clear separation between active and historical documents
- Team confidence in document versioning
- Reduced confusion about document authority

## Timeline

| Phase              | Start Date | End Date   | Deliverables                     |
| ------------------ | ---------- | ---------- | -------------------------------- |
| Analysis           | 2026-03-12 | 2026-03-13 | Document classification report   |
| Structure Creation | 2026-03-13 | 2026-03-14 | Archive directory structure      |
| Document Migration | 2026-03-14 | 2026-03-15 | Archived documents with metadata |
| Reference Updates  | 2026-03-15 | 2026-03-16 | Updated project references       |
| Validation         | 2026-03-16 | 2026-03-17 | Validation report                |

## Team Responsibilities

| Role                  | Responsibilities                        |
| --------------------- | --------------------------------------- |
| **Archive Lead**      | Overall archive strategy and execution  |
| **Document Analysts** | Document classification and metadata    |
| **Technical Writers** | Archive documentation and guidelines    |
| **Development Team**  | Review and feedback on archive approach |

## Related Documents

- [Migration Tracking](../migration-tracking.md)
- [OpenSpec Configuration](../config.yaml)
- [Language Strategy](../templates/language-strategy-guide.md)
- [Validation Scripts](../scripts/validate-migration.sh)

---

**Version**: 1.0.0  
**Created**: 2026-03-12  
**Last Updated**: 2026-03-12  
**Status**: Draft  
**Owner**: Documentation Migration Team
