#!/bin/bash

# Migration Inventory Generation Script
# Version: 1.0.0
# Description: Generates inventory of docs/ files for migration planning

set -e

# Configuration
DOCS_DIR="docs"
OUTPUT_FILE="openspec/migration-inventory.csv"
REPORT_FILE=".sisyphus/evidence/migration-inventory-report.md"

# Create evidence directory
mkdir -p .sisyphus/evidence

# Initialize output files
echo "Source Path,File Size (KB),Last Modified,Language,Category,Priority,Target Path,Status,Notes" > "$OUTPUT_FILE"

echo "# Migration Inventory Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Function to detect language of a file
detect_language() {
    local file="$1"
    
    # Check for Chinese characters
    if grep -q -P "[\x{4e00}-\x{9fff}]" "$file" 2>/dev/null; then
        echo "Chinese"
    else
        echo "English"
    fi
}

# Function to categorize file based on path and content
categorize_file() {
    local file="$1"
    
    # Categorize by directory path
    case "$file" in
        docs/architecture/*)
            echo "Architecture Design"
            ;;
        docs/domain/strategic/*)
            echo "DDD Strategic Design"
            ;;
        docs/domain/tactical/*)
            echo "DDD Tactical Design"
            ;;
        docs/product/*|docs/requirements/*)
            echo "Product Specifications"
            ;;
        docs/research/ai-implementation/*)
            echo "AI Implementation Research"
            ;;
        docs/research/technical/*)
            echo "Technical Research"
            ;;
        docs/process/*|docs/guides/*)
            echo "Process Documentation"
            ;;
        docs/bugfix/*)
            echo "Bugfix Documentation"
            ;;
        docs/test/*)
            echo "Test Documentation"
            ;;
        docs/examples/*)
            echo "Examples"
            ;;
        *)
            # Try to categorize by content
            if grep -q -i "architecture\|design\|adr" "$file" 2>/dev/null; then
                echo "Architecture Design"
            elif grep -q -i "domain\|bounded context\|aggregate\|entity" "$file" 2>/dev/null; then
                echo "DDD Design"
            elif grep -q -i "product\|requirement\|user story\|backlog" "$file" 2>/dev/null; then
                echo "Product Specifications"
            elif grep -q -i "research\|study\|experiment" "$file" 2>/dev/null; then
                echo "Research"
            elif grep -q -i "process\|guide\|workflow" "$file" 2>/dev/null; then
                echo "Process Documentation"
            else
                echo "Uncategorized"
            fi
            ;;
    esac
}

# Function to determine priority
determine_priority() {
    local category="$1"
    local file="$2"
    
    case "$category" in
        "Product Specifications"|"Architecture Design"|"DDD Strategic Design")
            echo "High"
            ;;
        "DDD Tactical Design"|"AI Implementation Research"|"Process Documentation")
            echo "Medium"
            ;;
        "Technical Research")
            echo "Medium"
            ;;
        "Bugfix Documentation"|"Test Documentation"|"Examples")
            # Check if it's important bugfix or test
            if [[ "$file" == *"important"* ]] || [[ "$file" == *"critical"* ]]; then
                echo "Medium"
            else
                echo "Low"
            fi
            ;;
        *)
            echo "Low"
            ;;
    esac
}

# Function to suggest target path
suggest_target_path() {
    local file="$1"
    local category="$2"
    local language="$3"
    
    # Extract filename without path
    local filename=$(basename "$file")
    
    # Convert filename to kebab-case if needed
    local kebab_filename=$(echo "$filename" | sed 's/_/-/g' | tr '[:upper:]' '[:lower:]')
    
    # Map category to OpenSpec directory
    case "$category" in
        "Product Specifications")
            echo "openspec/specs/product/$kebab_filename"
            ;;
        "DDD Strategic Design")
            echo "openspec/specs/domain/strategic/$kebab_filename"
            ;;
        "DDD Tactical Design")
            echo "openspec/specs/domain/tactical/$kebab_filename"
            ;;
        "Architecture Design")
            echo "openspec/specs/architecture/$kebab_filename"
            ;;
        "AI Implementation Research")
            echo "openspec/specs/research/ai-implementation/$kebab_filename"
            ;;
        "Technical Research")
            echo "openspec/specs/research/technical/$kebab_filename"
            ;;
        "Process Documentation")
            echo "openspec/specs/_global/process/$kebab_filename"
            ;;
        *)
            echo "openspec/specs/_uncategorized/$kebab_filename"
            ;;
    esac
}

# Function to determine migration status
determine_status() {
    local category="$1"
    local priority="$2"
    
    case "$category" in
        "Bugfix Documentation"|"Test Documentation"|"Examples")
            echo "Exclude"
            ;;
        *)
            case "$priority" in
                "High")
                    echo "Migrate"
                    ;;
                "Medium")
                    echo "Review"
                    ;;
                "Low")
                    echo "Exclude"
                    ;;
                *)
                    echo "Review"
                    ;;
            esac
            ;;
    esac
}

# Main inventory generation
echo "Generating migration inventory..." | tee -a "$LOG_FILE"
echo "Scanning directory: $DOCS_DIR" | tee -a "$LOG_FILE"

total_files=0
processed_files=0

# Find all markdown files
while IFS= read -r file; do
    ((total_files++))
    
    # Skip if not a regular file
    [ -f "$file" ] || continue
    
    # Get file info
    file_size=$(du -k "$file" | cut -f1)
    last_modified=$(stat -c %y "$file" | cut -d' ' -f1)
    
    # Detect language
    language=$(detect_language "$file")
    
    # Categorize
    category=$(categorize_file "$file")
    
    # Determine priority
    priority=$(determine_priority "$category" "$file")
    
    # Suggest target path
    target_path=$(suggest_target_path "$file" "$category" "$language")
    
    # Determine status
    status=$(determine_status "$category" "$priority")
    
    # Generate notes
    notes=""
    if [ "$status" = "Exclude" ]; then
        notes="Low priority or specific documentation"
    fi
    
    # Write to CSV
    echo "\"$file\",$file_size,$last_modified,$language,$category,$priority,\"$target_path\",$status,\"$notes\"" >> "$OUTPUT_FILE"
    
    ((processed_files++))
    
    # Progress indicator
    if (( processed_files % 10 == 0 )); then
        echo "Processed $processed_files files..." | tee -a "$LOG_FILE"
    fi
    
done < <(find "$DOCS_DIR" -name "*.md" -type f)

# Generate summary report
echo "## Inventory Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- **Total files found**: $total_files" >> "$REPORT_FILE"
echo "- **Files processed**: $processed_files" >> "$REPORT_FILE"
echo "- **Inventory file**: [$OUTPUT_FILE]($OUTPUT_FILE)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Generate category breakdown
echo "## Category Breakdown" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Category | Count |" >> "$REPORT_FILE"
echo "|----------|-------|" >> "$REPORT_FILE"

# Count by category
declare -A category_count
while IFS=, read -r source size modified lang category priority target status notes; do
    # Remove quotes
    category=$(echo "$category" | tr -d '"')
    ((category_count["$category"]++))
done < <(tail -n +2 "$OUTPUT_FILE")

for category in "${!category_count[@]}"; do
    echo "| $category | ${category_count[$category]} |" >> "$REPORT_FILE"
done

# Generate priority breakdown
echo "" >> "$REPORT_FILE"
echo "## Priority Breakdown" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Priority | Count |" >> "$REPORT_FILE"
echo "|----------|-------|" >> "$REPORT_FILE"

declare -A priority_count
while IFS=, read -r source size modified lang category priority target status notes; do
    priority=$(echo "$priority" | tr -d '"')
    ((priority_count["$priority"]++))
done < <(tail -n +2 "$OUTPUT_FILE")

for priority in "${!priority_count[@]}"; do
    echo "| $priority | ${priority_count[$priority]} |" >> "$REPORT_FILE"
done

# Generate status breakdown
echo "" >> "$REPORT_FILE"
echo "## Migration Status Breakdown" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Status | Count | Percentage |" >> "$REPORT_FILE"
echo "|--------|-------|------------|" >> "$REPORT_FILE"

declare -A status_count
while IFS=, read -r source size modified lang category priority target status notes; do
    status=$(echo "$status" | tr -d '"')
    ((status_count["$status"]++))
done < <(tail -n +2 "$OUTPUT_FILE")

for status in "${!status_count[@]}"; do
    count=${status_count[$status]}
    percentage=$((count * 100 / processed_files))
    echo "| $status | $count | $percentage% |" >> "$REPORT_FILE"
done

echo "" >> "$REPORT_FILE"
echo "## Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. Review the inventory CSV file: \`$OUTPUT_FILE\`" >> "$REPORT_FILE"
echo "2. Update migration tracking document with actual counts" >> "$REPORT_FILE"
echo "3. Begin migration with High priority files" >> "$REPORT_FILE"
echo "4. Review Medium priority files for inclusion" >> "$REPORT_FILE"
echo "5. Archive or exclude Low priority files" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"
echo "## Generated Files" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- **Inventory CSV**: \`$OUTPUT_FILE\` - Complete file inventory with categorization" >> "$REPORT_FILE"
echo "- **Report**: \`$REPORT_FILE\` - Summary report with breakdowns" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "*Report generated by migration inventory script on $(date)*" >> "$REPORT_FILE"

echo "Inventory generation complete!" | tee -a "$LOG_FILE"
echo "Total files: $total_files" | tee -a "$LOG_FILE"
echo "Processed files: $processed_files" | tee -a "$LOG_FILE"
echo "Output file: $OUTPUT_FILE" | tee -a "$LOG_FILE"
echo "Report file: $REPORT_FILE" | tee -a "$LOG_FILE"