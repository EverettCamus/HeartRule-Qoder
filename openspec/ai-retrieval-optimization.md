# AI Retrieval Optimization Strategy

## Overview

This document defines the strategy for optimizing AI retrieval of HeartRule documentation to avoid confusion between authoritative OpenSpec documents and historical reference documents in the `docs/` directory.

## Problem Statement

AI systems (Oh My OpenCode, OpenCode, etc.) may experience confusion when:

1. Searching for documentation and finding both OpenSpec and docs/ versions
2. Determining which document is authoritative
3. Understanding document roles and relationships
4. Prioritizing search results

## Solution Strategy

### 1. Document Role Metadata

#### OpenSpec Documents (Authoritative)

```yaml
# Add to openspec/config.yaml
document_roles:
  openspec:
    authority: primary
    status: active
    purpose: specification
    search_priority: high
    tags: [authoritative, current, must-follow]
```

#### docs/ Documents (Historical Reference)

```yaml
document_roles:
  docs:
    authority: secondary
    status: archived
    purpose: reference
    search_priority: medium
    tags: [historical, reference, archived]
```

### 2. Search Priority Rules

#### Rule 1: Authority Priority

```
IF document.path CONTAINS "openspec/"
THEN boost_score = 1.5
ELSE IF document.path CONTAINS "docs/"
THEN boost_score = 0.7
```

#### Rule 2: Recency Priority

```
IF document.modified_date > (today - 30 days)
THEN boost_score = boost_score * 1.2
ELSE IF document.modified_date < (today - 180 days)
THEN boost_score = boost_score * 0.8
```

#### Rule 3: Document Type Priority

```
CASE document.type:
  "specification": boost_score = boost_score * 1.3
  "design": boost_score = boost_score * 1.2
  "research": boost_score = boost_score * 1.1
  "bugfix": boost_score = boost_score * 0.9
```

### 3. Metadata Implementation

#### OpenSpec Document Headers

```markdown
---
document_id: openspec-spec-product-backlog
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
migrated_from: docs/product/productbacklog.md
tags: [product, specification, authoritative]
search_priority: high
---
```

#### docs/ Document Headers

```markdown
---
document_id: docs-product-backlog
authority: historical
status: archived
version: 0.9.0
last_updated: 2026-03-11
archived_date: 2026-03-12
migrated_to: openspec/specs/product/product-backlog.md
tags: [product, historical, reference]
search_priority: medium
---
```

### 4. AI System Integration

#### Oh My OpenCode Configuration

```yaml
# .omo/config.yaml
document_search:
  priority_rules:
    - pattern: '**/openspec/**'
      weight: 1.5
      tags: ['authoritative']
    - pattern: '**/docs/**'
      weight: 0.7
      tags: ['historical']

  metadata_fields:
    - authority
    - status
    - version
    - search_priority
    - tags
```

#### OpenCode Configuration

```javascript
// .opencode/search-config.js
module.exports = {
  documentWeights: {
    'openspec/': 1.5,
    'docs/': 0.7,
    'docs-archive/': 0.5,
  },

  metadataBoost: {
    authority: { primary: 1.3, secondary: 0.8 },
    status: { active: 1.2, archived: 0.7 },
    search_priority: { high: 1.4, medium: 1.0, low: 0.6 },
  },
};
```

### 5. Search Result Presentation

#### Primary Results (OpenSpec)

```
✅ [AUTHORITATIVE] Product Backlog
   openspec/specs/product/product-backlog.md
   Version: 1.0.0 | Updated: 2026-03-12
   └─ Current product specifications and requirements
```

#### Secondary Results (docs/)

```
📚 [HISTORICAL REFERENCE] Product Backlog (Archived)
   docs/product/productbacklog.md
   Version: 0.9.0 | Archived: 2026-03-12
   └─ Historical reference - migrated to OpenSpec
```

### 6. Implementation Steps

#### Phase 1: Metadata Addition

1. Add metadata headers to all OpenSpec documents
2. Add metadata headers to docs/ documents
3. Update configuration files

#### Phase 2: Search Configuration

1. Configure Oh My OpenCode search rules
2. Configure OpenCode search weights
3. Test search result prioritization

#### Phase 3: Validation

1. Run search tests with sample queries
2. Verify authoritative documents appear first
3. Check historical documents are properly tagged

#### Phase 4: Monitoring

1. Monitor search analytics
2. Collect user feedback
3. Adjust weights based on usage patterns

### 7. Technical Implementation

#### Metadata Script

```bash
#!/bin/bash
# scripts/add-document-metadata.sh

# Add metadata to OpenSpec documents
for file in openspec/specs/**/*.md; do
  add_openspec_metadata "$file"
done

# Add metadata to docs/ documents
for file in docs/**/*.md; do
  add_docs_metadata "$file"
done
```

#### Search Test Script

```bash
#!/bin/bash
# scripts/test-ai-search.sh

# Test search with sample queries
test_query "product backlog"
test_query "architecture design"
test_query "DDD tactical design"

# Verify search results
verify_search_results \
  --primary-pattern "openspec/" \
  --secondary-pattern "docs/" \
  --expected-order "openspec,docs"
```

### 8. Quality Metrics

#### Success Criteria

- [ ] 95% of searches return OpenSpec documents as first result
- [ ] Historical documents clearly marked as "archived" or "reference"
- [ ] Users report reduced confusion about document authority
- [ ] Search performance within acceptable limits (< 2 seconds)

#### Monitoring Metrics

- Search result click-through rates
- User satisfaction surveys
- Search query success rates
- Document access patterns

### 9. Risk Management

#### Risks

1. **Over-prioritization**: OpenSpec documents dominate results too much
2. **Metadata Bloat**: Too much metadata affects performance
3. **Configuration Complexity**: Complex search rules hard to maintain
4. **User Confusion**: New metadata fields confuse users

#### Mitigation Strategies

1. **Gradual Rollout**: Implement in phases, monitor impact
2. **Performance Testing**: Regular performance benchmarks
3. **Simplified Rules**: Start with simple rules, add complexity gradually
4. **User Education**: Clear documentation about document roles

### 10. Maintenance Plan

#### Regular Updates

- Monthly review of search weights
- Quarterly metadata validation
- Bi-annual search rule optimization

#### Change Management

- Document all configuration changes
- Test changes in staging environment
- Roll back if performance degrades

### 11. Related Documents

- [Migration Tracking](./migration-tracking.md)
- [Archive Plan](./archive-plan.md)
- [OpenSpec Configuration](./config.yaml)
- [Language Strategy](./templates/language-strategy-guide.md)

---

**Version**: 1.0.0  
**Created**: 2026-03-12  
**Last Updated**: 2026-03-12  
**Status**: Draft  
**Owner**: AI Integration Team
