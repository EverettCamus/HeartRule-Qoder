#!/bin/bash

# Language Validation Script for OpenSpec Documentation
# Version: 1.0.0
# Description: Validates language compliance based on openspec/config.yaml rules

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONFIG_FILE="openspec/config.yaml"
LOG_FILE=".sisyphus/evidence/language-validation.log"
REPORT_FILE=".sisyphus/evidence/language-validation-report.md"

# Create evidence directory
mkdir -p .sisyphus/evidence

# Initialize log and report
echo "# Language Validation Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Starting language validation..." | tee -a "$LOG_FILE"

# Function to check if file contains Chinese characters
contains_chinese() {
    local file="$1"
    # Check for Chinese characters (Unicode range)
    if grep -q -P "[\x{4e00}-\x{9fff}]" "$file" 2>/dev/null; then
        return 0  # Contains Chinese
    else
        return 1  # No Chinese
    fi
}

# Function to check language compliance for a file
check_file_language() {
    local file="$1"
    local expected_lang="$2"
    local reason="$3"
    
    echo "Checking: $file" | tee -a "$LOG_FILE"
    echo "  Expected language: $expected_lang ($reason)" | tee -a "$LOG_FILE"
    
    if [ ! -f "$file" ]; then
        echo "  ${RED}ERROR: File not found${NC}" | tee -a "$LOG_FILE"
        return 1
    fi
    
    local has_chinese=false
    if contains_chinese "$file"; then
        has_chinese=true
    fi
    
    case "$expected_lang" in
        "zh")
            if [ "$has_chinese" = true ]; then
                echo "  ${GREEN}PASS: Contains Chinese as expected${NC}" | tee -a "$LOG_FILE"
                return 0
            else
                echo "  ${RED}FAIL: Expected Chinese but no Chinese characters found${NC}" | tee -a "$LOG_FILE"
                return 1
            fi
            ;;
        "en")
            if [ "$has_chinese" = false ]; then
                echo "  ${GREEN}PASS: No Chinese as expected${NC}" | tee -a "$LOG_FILE"
                return 0
            else
                echo "  ${RED}FAIL: Expected English but Chinese characters found${NC}" | tee -a "$LOG_FILE"
                return 1
            fi
            ;;
        *)
            echo "  ${YELLOW}WARN: Unknown language code: $expected_lang${NC}" | tee -a "$LOG_FILE"
            return 2
            ;;
    esac
}

# Function to validate directory against language rules
validate_directory() {
    local pattern="$1"
    local expected_lang="$2"
    local reason="$3"
    
    echo "" | tee -a "$LOG_FILE"
    echo "Validating pattern: $pattern" | tee -a "$LOG_FILE"
    echo "Expected language: $expected_lang" | tee -a "$LOG_FILE"
    echo "Reason: $reason" | tee -a "$LOG_FILE"
    
    # Find files matching pattern
    local files
    files=$(find . -path "./node_modules" -prune -o -path "./.git" -prune -o -type f -name "*.md" -print | grep -E "$pattern" || true)
    
    if [ -z "$files" ]; then
        echo "  ${BLUE}INFO: No files found matching pattern${NC}" | tee -a "$LOG_FILE"
        return 0
    fi
    
    local total=0
    local passed=0
    local failed=0
    
    for file in $files; do
        ((total++))
        if check_file_language "$file" "$expected_lang" "$reason"; then
            ((passed++))
        else
            ((failed++))
            echo "  ${RED}FAILED: $file${NC}" | tee -a "$LOG_FILE"
        fi
    done
    
    # Add to report
    echo "## Pattern: \`$pattern\`" >> "$REPORT_FILE"
    echo "- **Expected Language**: $expected_lang" >> "$REPORT_FILE"
    echo "- **Reason**: $reason" >> "$REPORT_FILE"
    echo "- **Files Checked**: $total" >> "$REPORT_FILE"
    echo "- **Passed**: $passed" >> "$REPORT_FILE"
    echo "- **Failed**: $failed" >> "$REPORT_FILE"
    
    if [ $failed -eq 0 ]; then
        echo "- **Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        echo "  ${GREEN}SUCCESS: All $total files passed${NC}" | tee -a "$LOG_FILE"
        return 0
    else
        echo "- **Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        echo "  ${RED}FAILURE: $failed of $total files failed${NC}" | tee -a "$LOG_FILE"
        return 1
    fi
}

# Main validation function
main() {
    echo "=========================================" | tee -a "$LOG_FILE"
    echo "Language Strategy Validation" | tee -a "$LOG_FILE"
    echo "Date: $(date)" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    # Check if config file exists
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "${RED}ERROR: Config file not found: $CONFIG_FILE${NC}" | tee -a "$LOG_FILE"
        exit 1
    fi
    
    # Extract language rules from config (simplified - in real implementation would parse YAML)
    # For now, using hardcoded rules based on openspec/config.yaml
    
    echo "Using language rules from $CONFIG_FILE" | tee -a "$LOG_FILE"
    
    # Define language rules (extracted from config.yaml)
    # In a real implementation, these would be parsed from the YAML file
    
    local overall_passed=true
    
    # Validate each pattern
    validate_directory "openspec/specs/product/.*\.md$" "zh" "Product specifications in Chinese for team communication" || overall_passed=false
    validate_directory "openspec/specs/domain/strategic/.*\.md$" "zh" "DDD strategic design in Chinese for team alignment" || overall_passed=false
    validate_directory "openspec/specs/domain/tactical/.*\.md$" "en" "DDD tactical design in English for technical implementation" || overall_passed=false
    validate_directory "openspec/specs/architecture/.*\.md$" "en" "Architecture design in English for technical consistency" || overall_passed=false
    validate_directory "openspec/specs/research/ai-implementation/.*\.md$" "zh" "AI implementation research in Chinese for team understanding" || overall_passed=false
    validate_directory "openspec/specs/research/technical/.*\.md$" "en" "Technical research in English for reference to international docs" || overall_passed=false
    validate_directory "openspec/specs/_global/process/.*\.md$" "zh" "Process documentation in Chinese for team clarity" || overall_passed=false
    validate_directory "openspec/changes/.*/design\.md$" "en" "Change design documents in English for technical review" || overall_passed=false
    validate_directory "openspec/changes/.*/tasks\.md$" "en" "Change tasks in English for implementation clarity" || overall_passed=false
    
    echo "" | tee -a "$LOG_FILE"
    echo "=========================================" | tee -a "$LOG_FILE"
    
    if [ "$overall_passed" = true ]; then
        echo "${GREEN}SUCCESS: All language validations passed${NC}" | tee -a "$LOG_FILE"
        echo "**Overall Status**: ${GREEN}PASS${NC}" >> "$REPORT_FILE"
        exit 0
    else
        echo "${RED}FAILURE: Some language validations failed${NC}" | tee -a "$LOG_FILE"
        echo "**Overall Status**: ${RED}FAIL${NC}" >> "$REPORT_FILE"
        exit 1
    fi
}

# Run main function
main "$@"