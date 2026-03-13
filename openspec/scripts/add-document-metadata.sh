#!/bin/bash

# Document Metadata Addition Script
# Version: 1.0.0
# Description: Adds metadata headers to documents for AI retrieval optimization

set -e

# Don't exit on errors from metadata functions
set +e
# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_FILE=".sisyphus/evidence/document-metadata.log"
REPORT_FILE=".sisyphus/evidence/document-metadata-report.md"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create log directory
mkdir -p .sisyphus/evidence

# Initialize report
echo "# Document Metadata Addition Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Function to add metadata to OpenSpec document
add_openspec_metadata() {
    local file="$1"
    local relative_path="${file#openspec/}"
    
    echo "Adding OpenSpec metadata to: $file" | tee -a "$LOG_FILE"
    
    # Extract document information
    local filename=$(basename "$file")
    local dirname=$(dirname "$relative_path")
    local document_id="openspec-$(echo "$relative_path" | tr '/' '-' | tr '.' '-')"
    
    # Create metadata header
    local metadata="---
document_id: $document_id
authority: primary
status: active
version: 1.0.0
last_updated: $(date +%Y-%m-%d)
source: openspec
path: $relative_path
tags: [authoritative, current, specification]
search_priority: high
---"

    # Check if file already has metadata
    if head -10 "$file" | grep -q "^---$"; then
        echo "  ${YELLOW}WARN: File already has metadata header${NC}" | tee -a "$LOG_FILE"
        return 1
    fi
    
    # Add metadata to file
    local temp_file="${file}.tmp"
    echo "$metadata" > "$temp_file"
    echo "" >> "$temp_file"
    cat "$file" >> "$temp_file"
    
    # Replace original file
    mv "$temp_file" "$file"
    
    echo "  ${GREEN}SUCCESS: Metadata added${NC}" | tee -a "$LOG_FILE"
    return 0
}

# Function to add metadata to docs/ document
add_docs_metadata() {
    local file="$1"
    local relative_path="${file#docs/}"
    
    echo "Adding docs metadata to: $file" | tee -a "$LOG_FILE"
    
    # Extract document information
    local filename=$(basename "$file")
    local dirname=$(dirname "$relative_path")
    local document_id="docs-$(echo "$relative_path" | tr '/' '-' | tr '.' '-')"
    
    # Check if this document has been migrated
    local migrated_to=""
    if grep -q "$file" "openspec/migration-tracking.md"; then
        migrated_to=$(grep "$file" "openspec/migration-tracking.md" | awk -F'|' '{print $3}' | sed 's/^ *//;s/ *$//')
    fi
    
    # Create metadata header
    local metadata="---
document_id: $document_id
authority: historical
status: archived
version: 0.9.0
last_updated: $(date -d "30 days ago" +%Y-%m-%d)
archived_date: $(date +%Y-%m-%d)
source: docs
path: $relative_path"
    
    # Add migrated_to if available
    if [ -n "$migrated_to" ]; then
        metadata="$metadata
migrated_to: $migrated_to"
    fi
    
    metadata="$metadata
tags: [historical, reference, archived]
search_priority: medium
---"
    
    # Check if file already has metadata
    if head -10 "$file" | grep -q "^---$"; then
        echo "  ${YELLOW}WARN: File already has metadata header${NC}" | tee -a "$LOG_FILE"
        return 1
    fi
    
    # Add metadata to file
    local temp_file="${file}.tmp"
    echo "$metadata" > "$temp_file"
    echo "" >> "$temp_file"
    cat "$file" >> "$temp_file"
    
    # Replace original file
    mv "$temp_file" "$file"
    
    echo "  ${GREEN}SUCCESS: Metadata added${NC}" | tee -a "$LOG_FILE"
    return 0
}

# Function to process directory
process_directory() {
    local dir="$1"
    local processor="$2"
    local description="$3"
    
    echo "" | tee -a "$LOG_FILE"
    echo "Processing $description: $dir" | tee -a "$LOG_FILE"
    
    # Find markdown files
    local files=$(find "$dir" -name "*.md" -type f)
    local total_files=$(echo "$files" | wc -l | tr -d ' ')
    local processed=0
    local skipped=0
    local failed=0
    
    if [ "$total_files" -eq 0 ]; then
        echo "  ${BLUE}INFO: No markdown files found${NC}" | tee -a "$LOG_FILE"
        return 0
    fi
    
    for file in $files; do
        if $processor "$file"; then
            ((processed++))
        else
            ((skipped++))
        fi
    done
    
    # Add to report
    echo "## $description" >> "$REPORT_FILE"
    echo "- **Directory**: $dir" >> "$REPORT_FILE"
    echo "- **Total Files**: $total_files" >> "$REPORT_FILE"
    echo "- **Processed**: $processed" >> "$REPORT_FILE"
    echo "- **Skipped**: $skipped" >> "$REPORT_FILE"
    echo "- **Failed**: $failed" >> "$REPORT_FILE"
    
    if [ $processed -gt 0 ]; then
        echo "- **Status**: ${GREEN}SUCCESS${NC}" >> "$REPORT_FILE"
    else
        echo "- **Status**: ${YELLOW}SKIPPED${NC}" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
    
    echo "  ${GREEN}Completed: $processed files processed, $skipped skipped${NC}" | tee -a "$LOG_FILE"
}

# Main function
main() {
    echo "=========================================" | tee -a "$LOG_FILE"
    echo "Document Metadata Addition" | tee -a "$LOG_FILE"
    echo "Date: $(date)" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    # Process OpenSpec documents
    process_directory "openspec/specs" add_openspec_metadata "OpenSpec Specifications"
    process_directory "openspec/templates" add_openspec_metadata "OpenSpec Templates"
    
    # Process docs/ documents (selectively)
    process_directory "docs/product" add_docs_metadata "Product Documentation"
    process_directory "docs/architecture" add_docs_metadata "Architecture Documentation"
    process_directory "docs/design" add_docs_metadata "Design Documentation"
    process_directory "docs/research" add_docs_metadata "Research Documentation"
    
    # Summary
    echo "" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    echo "Summary" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    echo "Metadata addition completed." | tee -a "$LOG_FILE"
    echo "Report: $REPORT_FILE" | tee -a "$LOG_FILE"
    echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
    
    echo "" | tee -a "$LOG_FILE"
    echo "${GREEN}SUCCESS: Document metadata addition completed${NC}" | tee -a "$LOG_FILE"
    
    # Re-enable error checking for script exit
    set -e
}

# Run main function
main "$@"