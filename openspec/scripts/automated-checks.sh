#!/bin/bash

# Automated Checks Script for OpenSpec Documentation
# Version: 1.0.0
# Description: Runs automated checks for documentation quality and compliance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONFIG_FILE="openspec/config.yaml"
LOG_DIR=".sisyphus/evidence/automated-checks"
REPORT_FILE="$LOG_DIR/automated-checks-report.md"
SUMMARY_FILE="$LOG_DIR/check-summary.json"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create log directory
mkdir -p "$LOG_DIR"

# Initialize report
echo "# Automated Checks Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "Check ID: $TIMESTAMP" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Initialize summary JSON
echo "{" > "$SUMMARY_FILE"
echo "  \"timestamp\": \"$(date -Iseconds)\"," >> "$SUMMARY_FILE"
echo "  \"check_id\": \"$TIMESTAMP\"," >> "$SUMMARY_FILE"
echo "  \"checks\": [" >> "$SUMMARY_FILE"

# Function to log check result
log_check_result() {
    local check_name="$1"
    local status="$2"  # PASS, FAIL, WARN
    local message="$3"
    local details="$4"
    
    local color
    case "$status" in
        "PASS") color="$GREEN" ;;
        "FAIL") color="$RED" ;;
        "WARN") color="$YELLOW" ;;
        *) color="$NC" ;;
    esac
    
    echo "  $color$status$NC: $check_name - $message"
    
    # Add to report
    echo "## $check_name" >> "$REPORT_FILE"
    echo "- **Status**: $status" >> "$REPORT_FILE"
    echo "- **Message**: $message" >> "$REPORT_FILE"
    if [ -n "$details" ]; then
        echo "- **Details**: $details" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
    
    # Add to JSON summary
    if [ "$check_name" != "First Check" ]; then
        echo "    ," >> "$SUMMARY_FILE"
    fi
    echo "    {" >> "$SUMMARY_FILE"
    echo "      \"name\": \"$check_name\"," >> "$SUMMARY_FILE"
    echo "      \"status\": \"$status\"," >> "$SUMMARY_FILE"
    echo "      \"message\": \"$message\"," >> "$SUMMARY_FILE"
    if [ -n "$details" ]; then
        echo "      \"details\": \"$details\"" >> "$SUMMARY_FILE"
    else
        echo "      \"details\": null" >> "$SUMMARY_FILE"
    fi
    echo "    }" >> "$SUMMARY_FILE"
}

# Function to check file existence
check_file_exists() {
    local file="$1"
    local description="$2"
    
    if [ -f "$file" ]; then
        log_check_result "File Existence Check" "PASS" "$description file exists" "$file"
        return 0
    else
        log_check_result "File Existence Check" "FAIL" "$description file not found" "$file"
        return 1
    fi
}

# Function to check directory structure
check_directory_structure() {
    echo "Checking directory structure..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
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
    
    local missing_dirs=()
    
    for dir in "${expected_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            missing_dirs+=("$dir")
        fi
    done
    
    if [ ${#missing_dirs[@]} -eq 0 ]; then
        log_check_result "Directory Structure" "PASS" "All required directories exist" "${#expected_dirs[@]} directories checked"
        return 0
    else
        log_check_result "Directory Structure" "FAIL" "Missing directories: ${missing_dirs[*]}" "${#missing_dirs[@]} of ${#expected_dirs[@]} directories missing"
        return 1
    fi
}

# Function to check markdown file quality
check_markdown_quality() {
    echo "Checking markdown file quality..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
    local markdown_files=$(find openspec -name "*.md" -type f)
    local total_files=$(echo "$markdown_files" | wc -l | tr -d ' ')
    local issues_found=0
    local issue_details=""
    
    if [ "$total_files" -eq 0 ]; then
        log_check_result "Markdown Quality" "WARN" "No markdown files found in openspec directory" "0 files checked"
        return 2
    fi
    
    for file in $markdown_files; do
        # Check for empty files
        if [ ! -s "$file" ]; then
            issues_found=$((issues_found + 1))
            issue_details+="Empty file: $file; "
        fi
        
        # Check for files without headers
        if ! head -5 "$file" | grep -q "^# "; then
            issues_found=$((issues_found + 1))
            issue_details+="No header in: $file; "
        fi
        
        # Check for very long lines (over 200 characters)
        if grep -q '.\{200\}' "$file"; then
            issues_found=$((issues_found + 1))
            issue_details+="Long lines in: $file; "
        fi
    done
    
    if [ $issues_found -eq 0 ]; then
        log_check_result "Markdown Quality" "PASS" "All markdown files meet quality standards" "$total_files files checked"
        return 0
    else
        log_check_result "Markdown Quality" "WARN" "Found $issues_found quality issues in markdown files" "Issues: ${issue_details:0:200}..."
        return 2
    fi
}

# Function to check for broken links
check_broken_links() {
    echo "Checking for broken links..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
    local markdown_files=$(find openspec -name "*.md" -type f)
    local broken_links=0
    local link_details=""
    
    for file in $markdown_files; do
        # Extract links from markdown
        local links=$(grep -o '\[[^]]*\]([^)]*)' "$file" | sed 's/.*(//;s/).*//' || echo "")
        
        for link in $links; do
            # Skip external links and anchors
            if [[ $link == http* ]] || [[ $link == https* ]] || [[ $link == \#* ]]; then
                continue
            fi
            
            # Handle relative paths
            local linked_file="$link"
            if [[ $link != /* ]]; then
                local file_dir=$(dirname "$file")
                linked_file="$file_dir/$link"
            fi
            
            if [ ! -f "$linked_file" ] && [ ! -d "$linked_file" ]; then
                broken_links=$((broken_links + 1))
                link_details+="Broken link in $file: $link; "
            fi
        done
    done
    
    if [ $broken_links -eq 0 ]; then
        log_check_result "Broken Links" "PASS" "No broken links found" "Checked all internal links"
        return 0
    else
        log_check_result "Broken Links" "FAIL" "Found $broken_links broken links" "Issues: ${link_details:0:200}..."
        return 1
    fi
}

# Function to check language compliance
check_language_compliance() {
    echo "Checking language compliance..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
    if [ ! -f "openspec/templates/language-validation-script.sh" ]; then
        log_check_result "Language Compliance" "WARN" "Language validation script not found" "openspec/templates/language-validation-script.sh"
        return 2
    fi
    
    # Run language validation script
    if bash openspec/templates/language-validation-script.sh > "$LOG_DIR/language-validation-$TIMESTAMP.log" 2>&1; then
        log_check_result "Language Compliance" "PASS" "Language validation passed" "See $LOG_DIR/language-validation-$TIMESTAMP.log for details"
        return 0
    else
        log_check_result "Language Compliance" "FAIL" "Language validation failed" "See $LOG_DIR/language-validation-$TIMESTAMP.log for details"
        return 1
    fi
}

# Function to check migration status
check_migration_status() {
    echo "Checking migration status..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
    if [ ! -f "openspec/migration-tracking.md" ]; then
        log_check_result "Migration Status" "WARN" "Migration tracking document not found" "openspec/migration-tracking.md"
        return 2
    fi
    
    local total_files=$(grep -c "docs/" "openspec/migration-tracking.md" || echo "0")
    local migrated_files=$(grep -c "Migrated" "openspec/migration-tracking.md" || echo "0")
    
    if [ $total_files -eq 0 ]; then
        log_check_result "Migration Status" "WARN" "No files tracked in migration document" "0 files tracked"
        return 2
    fi
    
    local progress_percent=0
    if [ $total_files -gt 0 ]; then
        progress_percent=$((migrated_files * 100 / total_files))
    fi
    
    if [ $progress_percent -ge 80 ]; then
        log_check_result "Migration Status" "PASS" "Migration progress is good" "$progress_percent% complete ($migrated_files/$total_files)"
        return 0
    elif [ $progress_percent -ge 50 ]; then
        log_check_result "Migration Status" "WARN" "Migration progress is moderate" "$progress_percent% complete ($migrated_files/$total_files)"
        return 2
    else
        log_check_result "Migration Status" "FAIL" "Migration progress is low" "$progress_percent% complete ($migrated_files/$total_files)"
        return 1
    fi
}

# Function to check script executability
check_script_executability() {
    echo "Checking script executability..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
    local scripts=$(find openspec/scripts -name "*.sh" -type f)
    local total_scripts=$(echo "$scripts" | wc -l | tr -d ' ')
    local non_executable=0
    local script_details=""
    
    if [ "$total_scripts" -eq 0 ]; then
        log_check_result "Script Executability" "WARN" "No shell scripts found in openspec/scripts" "0 scripts checked"
        return 2
    fi
    
    for script in $scripts; do
        if [ ! -x "$script" ]; then
            non_executable=$((non_executable + 1))
            script_details+="Not executable: $script; "
        fi
    done
    
    if [ $non_executable -eq 0 ]; then
        log_check_result "Script Executability" "PASS" "All scripts are executable" "$total_scripts scripts checked"
        return 0
    else
        log_check_result "Script Executability" "FAIL" "Found $non_executable non-executable scripts" "Issues: ${script_details:0:200}..."
        return 1
    fi
}

# Function to check template completeness
check_template_completeness() {
    echo "Checking template completeness..." | tee -a "$LOG_DIR/check-$TIMESTAMP.log"
    
    local expected_templates=(
        "openspec/templates/document-templates/product-specification-template.md"
        "openspec/templates/document-templates/ddd-strategic-design-template.md"
        "openspec/templates/document-templates/architecture-design-template.md"
        "openspec/templates/workflow-cheat-sheet.md"
        "openspec/templates/language-validation-script.sh"
    )
    
    local missing_templates=()
    
    for template in "${expected_templates[@]}"; do
        if [ ! -f "$template" ]; then
            missing_templates+=("$template")
        fi
    done
    
    if [ ${#missing_templates[@]} -eq 0 ]; then
        log_check_result "Template Completeness" "PASS" "All expected templates exist" "${#expected_templates[@]} templates checked"
        return 0
    else
        log_check_result "Template Completeness" "WARN" "Missing templates: ${missing_templates[*]}" "${#missing_templates[@]} of ${#expected_templates[@]} templates missing"
        return 2
    fi
}

# Main function
main() {
    echo "========================================="
    echo "Automated Checks for OpenSpec Documentation"
    echo "Date: $(date)"
    echo "Check ID: $TIMESTAMP"
    echo "========================================="
    
    # Log file for this run
    local log_file="$LOG_DIR/check-$TIMESTAMP.log"
    echo "Automated Checks Log - $TIMESTAMP" > "$log_file"
    echo "Started: $(date)" >> "$log_file"
    echo "" >> "$log_file"
    
    # Run checks
    local overall_status="PASS"
    local check_results=()
    
    # Initial dummy check to start JSON array
    log_check_result "First Check" "PASS" "Starting automated checks" ""
    
    # Run all checks
    echo "Running checks..." | tee -a "$log_file"
    
    # Check 1: Required files
    check_file_exists "$CONFIG_FILE" "OpenSpec config" || overall_status="FAIL"
    
    # Check 2: Directory structure
    check_directory_structure || [ "$overall_status" = "PASS" ] && overall_status="WARN"
    
    # Check 3: Markdown quality
    check_markdown_quality || [ "$overall_status" = "PASS" ] && overall_status="WARN"
    
    # Check 4: Broken links
    check_broken_links || overall_status="FAIL"
    
    # Check 5: Language compliance
    check_language_compliance || overall_status="FAIL"
    
    # Check 6: Migration status
    check_migration_status || [ "$overall_status" = "PASS" ] && overall_status="WARN"
    
    # Check 7: Script executability
    check_script_executability || overall_status="FAIL"
    
    # Check 8: Template completeness
    check_template_completeness || [ "$overall_status" = "PASS" ] && overall_status="WARN"
    
    # Remove the dummy first check from JSON
    sed -i '1,18d' "$SUMMARY_FILE"
    echo "  ]" >> "$SUMMARY_FILE"
    echo "}" >> "$SUMMARY_FILE"
    
    # Final summary
    echo "" | tee -a "$log_file"
    echo "=========================================" | tee -a "$log_file"
    echo "Check Summary" | tee -a "$log_file"
    echo "=========================================" | tee -a "$log_file"
    
    local pass_count=$(grep -c '"status": "PASS"' "$SUMMARY_FILE")
    local fail_count=$(grep -c '"status": "FAIL"' "$SUMMARY_FILE")
    local warn_count=$(grep -c '"status": "WARN"' "$SUMMARY_FILE")
    
    echo "Total checks: $((pass_count + fail_count + warn_count))" | tee -a "$log_file"
    echo "Passed: $pass_count" | tee -a "$log_file"
    echo "Failed: $fail_count" | tee -a "$log_file"
    echo "Warnings: $warn_count" | tee -a "$log_file"
    
    # Add summary to report
    echo "# Summary" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "- **Total Checks**: $((pass_count + fail_count + warn_count))" >> "$REPORT_FILE"
    echo "- **Passed**: $pass_count" >> "$REPORT_FILE"
    echo "- **Failed**: $fail_count" >> "$REPORT_FILE"
    echo "- **Warnings**: $warn_count" >> "$REPORT_FILE"
    echo "- **Overall Status**: $overall_status" >> "$REPORT_FILE"
    
    echo "" | tee -a "$log_file"
    echo "Detailed report: $REPORT_FILE" | tee -a "$log_file"
    echo "JSON summary: $SUMMARY_FILE" | tee -a "$log_file"
    echo "Log file: $log_file" | tee -a "$log_file"
    
    echo "" | tee -a "$log_file"
    echo "=========================================" | tee -a "$log_file"
    
    case "$overall_status" in
        "PASS")
            echo "${GREEN}SUCCESS: All checks passed or have only warnings${NC}" | tee -a "$log_file"
            echo "**Overall Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
            exit 0
            ;;
        "WARN")
            echo "${YELLOW}WARNING: Some checks have warnings${NC}" | tee -a "$log_file"
            echo "**Overall Status**: ${YELLOW}WARNING${NC}" >> "$REPORT_FILE"
            exit 0  # Warnings don't fail the build
            ;;
        "FAIL")
            echo "${RED}FAILURE: Some checks failed${NC}" | tee -a "$log_file"
            echo "**Overall Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"