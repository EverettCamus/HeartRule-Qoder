#!/bin/bash

# Migration Validation Script
# Version: 1.0.0
# Description: Validates migration completeness and quality for OpenSpec documentation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONFIG_FILE="openspec/config.yaml"
MIGRATION_TRACKING="openspec/migration-tracking.md"
INVENTORY_FILE="openspec/migration-inventory.csv"
LOG_FILE=".sisyphus/evidence/migration-validation.log"
REPORT_FILE=".sisyphus/evidence/migration-validation-report.md"
VALIDATION_RESULTS=".sisyphus/evidence/migration-validation-results.json"

# Create evidence directory
mkdir -p .sisyphus/evidence

# Initialize log and report
echo "# Migration Validation Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Starting migration validation..." | tee -a "$LOG_FILE"

# Function to check if file exists and is readable
check_file_exists() {
    local file="$1"
    local description="$2"
    
    echo "Checking $description: $file" | tee -a "$LOG_FILE"
    
    if [ ! -f "$file" ]; then
        echo "  ${RED}ERROR: File not found${NC}" | tee -a "$LOG_FILE"
        return 1
    fi
    
    if [ ! -r "$file" ]; then
        echo "  ${RED}ERROR: File not readable${NC}" | tee -a "$LOG_FILE"
        return 1
    fi
    
    echo "  ${GREEN}PASS: File exists and is readable${NC}" | tee -a "$LOG_FILE"
    return 0
}

# Function to check migration tracking completeness
check_migration_tracking() {
    echo "" | tee -a "$LOG_FILE"
    echo "Checking migration tracking..." | tee -a "$LOG_FILE"
    
    local total_files=$(grep -c "docs/" "$MIGRATION_TRACKING" || echo "0")
    local migrated_files=$(grep -c "Migrated" "$MIGRATION_TRACKING" || echo "0")
    local pending_files=$((total_files - migrated_files))
    
    echo "  Total files tracked: $total_files" | tee -a "$LOG_FILE"
    echo "  Migrated files: $migrated_files" | tee -a "$LOG_FILE"
    echo "  Pending files: $pending_files" | tee -a "$LOG_FILE"
    
    # Add to report
    echo "## Migration Tracking Status" >> "$REPORT_FILE"
    echo "- **Total Files Tracked**: $total_files" >> "$REPORT_FILE"
    echo "- **Migrated Files**: $migrated_files" >> "$REPORT_FILE"
    echo "- **Pending Files**: $pending_files" >> "$REPORT_FILE"
    
    if [ $total_files -eq 0 ]; then
        echo "  ${YELLOW}WARN: No files tracked in migration document${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${YELLOW}WARNING - No files tracked${NC}" >> "$REPORT_FILE"
        return 2
    fi
    
    local progress_percent=0
    if [ $total_files -gt 0 ]; then
        progress_percent=$((migrated_files * 100 / total_files))
    fi
    
    echo "  Progress: $progress_percent%" | tee -a "$LOG_FILE"
    echo "- **Progress**: $progress_percent%" >> "$REPORT_FILE"
    
    if [ $progress_percent -ge 80 ]; then
        echo "  ${GREEN}PASS: Migration progress is good ($progress_percent%)${NC}" | tee -a "$LOG_FILE"
        echo "- **Overall Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        return 0
    elif [ $progress_percent -ge 50 ]; then
        echo "  ${YELLOW}WARN: Migration progress is moderate ($progress_percent%)${NC}" | tee -a "$LOG_FILE"
        echo "- **Overall Status**: ${YELLOW}WARNING - Moderate progress${NC}" >> "$REPORT_FILE"
        return 2
    else
        echo "  ${RED}FAIL: Migration progress is low ($progress_percent%)${NC}" | tee -a "$LOG_FILE"
        echo "- **Overall Status**: ${RED}FAIL - Low progress${NC}" >> "$REPORT_FILE"
        return 1
    fi
}

# Function to check migrated file integrity
check_migrated_files() {
    echo "" | tee -a "$LOG_FILE"
    echo "Checking migrated file integrity..." | tee -a "$LOG_FILE"
    
    # Extract migrated files from tracking document
    local migrated_files=$(grep "Migrated" "$MIGRATION_TRACKING" | awk -F'|' '{print $2}' | sed 's/^ *//;s/ *$//' || echo "")
    
    if [ -z "$migrated_files" ]; then
        echo "  ${YELLOW}WARN: No migrated files found in tracking document${NC}" | tee -a "$LOG_FILE"
        return 2
    fi
    
    local total=0
    local passed=0
    local failed=0
    
    # Check each migrated file
    for target_file in $migrated_files; do
        ((total++))
        
        # Clean up file path
        target_file=$(echo "$target_file" | sed 's/^ *//;s/ *$//')
        
        echo "  Checking: $target_file" | tee -a "$LOG_FILE"
        
        if [ ! -f "$target_file" ]; then
            echo "    ${RED}FAIL: Migrated file not found${NC}" | tee -a "$LOG_FILE"
            ((failed++))
            continue
        fi
        
        # Check file size
        local file_size=$(stat -f%z "$target_file" 2>/dev/null || stat -c%s "$target_file" 2>/dev/null || echo "0")
        if [ "$file_size" -eq 0 ]; then
            echo "    ${RED}FAIL: Migrated file is empty${NC}" | tee -a "$LOG_FILE"
            ((failed++))
            continue
        fi
        
        # Check if file contains content (not just headers)
        local line_count=$(wc -l < "$target_file" || echo "0")
        if [ "$line_count" -lt 5 ]; then
            echo "    ${YELLOW}WARN: Migrated file has very few lines ($line_count)${NC}" | tee -a "$LOG_FILE"
        fi
        
        echo "    ${GREEN}PASS: File exists and has content ($file_size bytes, $line_count lines)${NC}" | tee -a "$LOG_FILE"
        ((passed++))
    done
    
    # Add to report
    echo "## Migrated File Integrity" >> "$REPORT_FILE"
    echo "- **Files Checked**: $total" >> "$REPORT_FILE"
    echo "- **Passed**: $passed" >> "$REPORT_FILE"
    echo "- **Failed**: $failed" >> "$REPORT_FILE"
    
    if [ $failed -eq 0 ]; then
        echo "  ${GREEN}SUCCESS: All $total migrated files passed integrity check${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        return 0
    else
        echo "  ${RED}FAILURE: $failed of $total migrated files failed integrity check${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        return 1
    fi
}

# Function to check directory structure compliance
check_directory_structure() {
    echo "" | tee -a "$LOG_FILE"
    echo "Checking directory structure compliance..." | tee -a "$LOG_FILE"
    
    # Expected directories based on OpenSpec structure
    local expected_dirs=(
        "openspec/specs/product"
        "openspec/specs/domain/strategic"
        "openspec/specs/domain/tactical"
        "openspec/specs/architecture"
        "openspec/specs/research/ai-implementation"
        "openspec/specs/research/technical"
        "openspec/specs/_global/process"
        "openspec/changes"
        "openspec/schemas"
        "openspec/scripts"
        "openspec/templates"
    )
    
    local total=${#expected_dirs[@]}
    local passed=0
    local failed=0
    
    for dir in "${expected_dirs[@]}"; do
        echo "  Checking: $dir" | tee -a "$LOG_FILE"
        
        if [ -d "$dir" ]; then
            echo "    ${GREEN}PASS: Directory exists${NC}" | tee -a "$LOG_FILE"
            ((passed++))
        else
            echo "    ${RED}FAIL: Directory not found${NC}" | tee -a "$LOG_FILE"
            ((failed++))
        fi
    done
    
    # Add to report
    echo "## Directory Structure Compliance" >> "$REPORT_FILE"
    echo "- **Directories Checked**: $total" >> "$REPORT_FILE"
    echo "- **Passed**: $passed" >> "$REPORT_FILE"
    echo "- **Failed**: $failed" >> "$REPORT_FILE"
    
    if [ $failed -eq 0 ]; then
        echo "  ${GREEN}SUCCESS: All $total directories exist${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        return 0
    else
        echo "  ${RED}FAILURE: $failed of $total directories missing${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        return 1
    fi
}

# Function to check for broken links in migrated documents
check_broken_links() {
    echo "" | tee -a "$LOG_FILE"
    echo "Checking for broken links..." | tee -a "$LOG_FILE"
    
    # Find all markdown files in openspec
    local markdown_files=$(find openspec -name "*.md" -type f)
    
    if [ -z "$markdown_files" ]; then
        echo "  ${YELLOW}WARN: No markdown files found in openspec directory${NC}" | tee -a "$LOG_FILE"
        return 2
    fi
    
    local total_files=0
    local files_with_links=0
    local broken_links_found=0
    
    for file in $markdown_files; do
        ((total_files++))
        
        # Extract links from markdown file
        local links=$(grep -o '\[[^]]*\]([^)]*)' "$file" | sed 's/.*(//;s/).*//' || echo "")
        
        if [ -n "$links" ]; then
            ((files_with_links++))
            
            for link in $links; do
                # Skip external links and anchors
                if [[ $link == http* ]] || [[ $link == https* ]] || [[ $link == \#* ]]; then
                    continue
                fi
                
                # Check if linked file exists
                local linked_file="$link"
                
                # Handle relative paths
                if [[ $link != /* ]]; then
                    local file_dir=$(dirname "$file")
                    linked_file="$file_dir/$link"
                fi
                
                if [ ! -f "$linked_file" ] && [ ! -d "$linked_file" ]; then
                    echo "  ${RED}BROKEN LINK: $file → $link${NC}" | tee -a "$LOG_FILE"
                    ((broken_links_found++))
                fi
            done
        fi
    done
    
    # Add to report
    echo "## Broken Links Check" >> "$REPORT_FILE"
    echo "- **Files Checked**: $total_files" >> "$REPORT_FILE"
    echo "- **Files With Links**: $files_with_links" >> "$REPORT_FILE"
    echo "- **Broken Links Found**: $broken_links_found" >> "$REPORT_FILE"
    
    if [ $broken_links_found -eq 0 ]; then
        echo "  ${GREEN}SUCCESS: No broken links found${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        return 0
    else
        echo "  ${RED}FAILURE: Found $broken_links_found broken links${NC}" | tee -a "$LOG_FILE"
        echo "- **Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        return 1
    fi
}

# Function to run language validation
run_language_validation() {
    echo "" | tee -a "$LOG_FILE"
    echo "Running language validation..." | tee -a "$LOG_FILE"
    
    if [ ! -f "openspec/templates/language-validation-script.sh" ]; then
        echo "  ${YELLOW}WARN: Language validation script not found${NC}" | tee -a "$LOG_FILE"
        return 2
    fi
    
    # Run language validation script
    if bash openspec/templates/language-validation-script.sh; then
        echo "  ${GREEN}SUCCESS: Language validation passed${NC}" | tee -a "$LOG_FILE"
        echo "## Language Validation" >> "$REPORT_FILE"
        echo "- **Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        return 0
    else
        echo "  ${RED}FAILURE: Language validation failed${NC}" | tee -a "$LOG_FILE"
        echo "## Language Validation" >> "$REPORT_FILE"
        echo "- **Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        return 1
    fi
}

# Main validation function
main() {
    echo "=========================================" | tee -a "$LOG_FILE"
    echo "Migration Validation" | tee -a "$LOG_FILE"
    echo "Date: $(date)" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    local overall_passed=true
    local validation_results=()
    
    # Check required files
    check_file_exists "$CONFIG_FILE" "OpenSpec config file" || overall_passed=false
    check_file_exists "$MIGRATION_TRACKING" "Migration tracking document" || overall_passed=false
    
    # Run validations
    echo "" | tee -a "$LOG_FILE"
    echo "Running validations..." | tee -a "$LOG_FILE"
    
    # Migration tracking check
    if check_migration_tracking; then
        validation_results+=("Migration Tracking: PASS")
    else
        validation_results+=("Migration Tracking: FAIL")
        overall_passed=false
    fi
    
    # Migrated file integrity check
    if check_migrated_files; then
        validation_results+=("File Integrity: PASS")
    else
        validation_results+=("File Integrity: FAIL")
        overall_passed=false
    fi
    
    # Directory structure check
    if check_directory_structure; then
        validation_results+=("Directory Structure: PASS")
    else
        validation_results+=("Directory Structure: FAIL")
        overall_passed=false
    fi
    
    # Broken links check
    if check_broken_links; then
        validation_results+=("Broken Links: PASS")
    else
        validation_results+=("Broken Links: FAIL")
        overall_passed=false
    fi
    
    # Language validation
    if run_language_validation; then
        validation_results+=("Language Compliance: PASS")
    else
        validation_results+=("Language Compliance: FAIL")
        overall_passed=false
    fi
    
    # Summary
    echo "" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    echo "Validation Summary" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    for result in "${validation_results[@]}"; do
        echo "$result" | tee -a "$LOG_FILE"
    done
    
    echo "" | tee -a "$LOG_FILE"
    
    # Final report
    echo "## Validation Summary" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    for result in "${validation_results[@]}"; do
        echo "- $result" >> "$REPORT_FILE"
    done
    
    echo "" >> "$REPORT_FILE"
    
    if [ "$overall_passed" = true ]; then
        echo "${GREEN}SUCCESS: All validations passed${NC}" | tee -a "$LOG_FILE"
        echo "**Overall Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Migration validation completed successfully. All checks passed." >> "$REPORT_FILE"
        exit 0
    else
        echo "${RED}FAILURE: Some validations failed${NC}" | tee -a "$LOG_FILE"
        echo "**Overall Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Migration validation completed with failures. Please check the log for details." >> "$REPORT_FILE"
        exit 1
    fi
}

# Run main function
main "$@"