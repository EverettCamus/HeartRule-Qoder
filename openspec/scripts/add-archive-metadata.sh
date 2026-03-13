#!/bin/bash

# Add Archive Metadata Script
# Version: 1.0.0
# Description: Adds archive metadata to documents in docs-archive/

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_FILE=".sisyphus/evidence/archive-metadata.log"
REPORT_FILE=".sisyphus/evidence/archive-metadata-report.md"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create log directory
mkdir -p .sisyphus/evidence

# Initialize report
echo "# Archive Metadata Addition Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Function to add archive metadata
add_archive_metadata() {
    local file="$1"
    local archive_path="${file#docs-archive/}"
    
    echo "Adding archive metadata to: $file" | tee -a "$LOG_FILE"
    
    # Extract document information
    local filename=$(basename "$file")
    local dirname=$(dirname "$archive_path")
    local document_id="archive-$(echo "$archive_path" | tr '/' '-' | tr '.' '-' | tr ' ' '-')"
    
    # Check if this document has been migrated to OpenSpec
    local migrated_to=""
    if [[ "$archive_path" == "research/paper-01-Script-Based-Dialog-Policy-Planning.md" ]]; then
        migrated_to="openspec/specs/research/ai-implementation/script-based-dialog-policy-planning.md"
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
path: $archive_path"
    
    # Add migrated_to if available
    if [ -n "$migrated_to" ]; then
        metadata="$metadata
migrated_to: $migrated_to"
    fi
    
    metadata="$metadata
tags: [historical, reference, archived]
search_priority: low
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
    
    echo "  ${GREEN}SUCCESS: Archive metadata added${NC}" | tee -a "$LOG_FILE"
    return 0
}

# Function to process directory
process_archive_directory() {
    local dir="$1"
    local description="$2"
    
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
        if add_archive_metadata "$file"; then
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
    echo "Archive Metadata Addition" | tee -a "$LOG_FILE"
    echo "Date: $(date)" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    # Process archive directories
    process_archive_directory "docs-archive/bugfix" "Bug Fix Records"
    process_archive_directory "docs-archive/test" "Test Reports"
    process_archive_directory "docs-archive/temp" "Temporary Documents"
    process_archive_directory "docs-archive/research" "Research Papers"
    
    # Summary
    echo "" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    echo "Summary" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    echo "Archive metadata addition completed." | tee -a "$LOG_FILE"
    echo "Report: $REPORT_FILE" | tee -a "$LOG_FILE"
    echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
    
    echo "" | tee -a "$LOG_FILE"
    echo "${GREEN}SUCCESS: Archive metadata addition completed${NC}" | tee -a "$LOG_FILE"
}

# Run main function
main "$@"