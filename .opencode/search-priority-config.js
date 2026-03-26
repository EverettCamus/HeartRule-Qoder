/**
 * OpenCode Search Priority Configuration
 *
 * This configuration ensures AI systems prioritize OpenSpec documents
 * over archived documents in docs-archive/ and old docs/.
 */

module.exports = {
  // Document path weights - higher weight = higher priority
  documentWeights: {
    'openspec/': 2.0, // Highest priority: current OpenSpec documents
    'docs-archive/': 0.5, // Medium priority: archived historical documents
    'docs/': 0.3, // Lowest priority: old docs (should be empty after migration)
  },

  // Metadata-based boosting
  metadataBoost: {
    authority: {
      primary: 1.3, // OpenSpec documents
      secondary: 0.8, // Reference documents
      historical: 0.7, // Archived documents
    },
    status: {
      active: 1.2, // Current documents
      deprecated: 0.6, // Deprecated but still available
      archived: 0.5, // Archived documents
    },
    search_priority: {
      high: 1.4, // Must-read documents
      medium: 1.0, // Reference documents
      low: 0.6, // Historical/background
    },
  },

  // Tag-based filtering and boosting
  tagWeights: {
    authoritative: 1.3,
    current: 1.2,
    'must-follow': 1.4,
    historical: 0.7,
    reference: 0.8,
    archived: 0.5,
  },

  // Search result presentation rules
  presentation: {
    maxResults: 10,
    groupByAuthority: true,
    showAuthorityBadges: true,
    warnOnArchived: true,
  },

  // Validation rules
  validation: {
    requireMetadata: ['document_id', 'authority', 'status'],
    warnOnMissingMetadata: true,
    validateLinks: true,
  },
};
