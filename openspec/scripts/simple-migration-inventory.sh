#!/bin/bash

# Simple Migration Inventory Script
# Version: 1.0.0

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

# Simple language detection
detect_language() {
    local file="$1"
    if grep -q -P "[\x{4e00}-\x{9fff}]" "$file" 2>/dev/null; then
        echo "Chinese"
    else
        echo "English"
    fi
}

# Simple categorization
categorize_file() {
    local file="$1"
    
    case "$file" in
        docs/architecture/*) echo "Architecture Design" ;;
        docs/domain/strategic/*) echo "DDD Strategic Design" ;;
        docs/domain/tactical/*) echo "DDD Tactical Design" ;;
        docs/product/*|docs/requirements/*) echo "Product Specifications" ;;
        docs/research/ai-implementation/*) echo "AI Implementation Research" ;;
        docs/research/technical/*) echo "Technical Research" ;;
        docs/process/*|docs/guides/*) echo "Process Documentation" ;;
        docs/bugfix/*) echo "Bugfix Documentation" ;;
        docs/test/*) echo "Test Documentation" ;;
        docs/examples/*) echo "Examples" ;;
        *) echo "Uncategorized" ;;
    esac
}

# Main inventory generation
echo "Generating migration inventory..."
echo "Scanning directory: $DOCS_DIR"

total_files=0
processed_files=0

# Find and process markdown files
find "$DOCS_DIR" -name "*.md" -type f | while read -r file; do
    ((total_files++))
    
    # Get file info
    file_size=$(du -k "$file" 2>/dev/null | cut -f1 || echo "0")
    last_modified=$(stat -c %y "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
    
    # Detect language
    language=$(detect_language "$file")
    
    # Categorize
    category=$(categorize_file "$file")
    
    # Determine priority (simplified)
    case "$category" in
        "Architecture Design"|"DDD Strategic Design"|"Product Specifications")
            priority="High" ;;
        "DDD Tactical Design"|"AI Implementation Research"|"Process Documentation"|"Technical Research")
            priority="Medium" ;;
        *)
            priority="Low" ;;
    esac
    
    # Determine target path
    filename=$(basename "$file")
    kebab_filename=$(echo "$filename" | sed 's/_/-/g' | tr '[:upper:]' '[:lower:]')
    
    case "$category" in
        "Product Specifications") target="openspec/specs/product/$kebab_filename" ;;
        "DDD Strategic Design") target="openspec/specs/domain/strategic/$kebab_filename" ;;
        "DDD Tactical Design") target="openspec/specs/domain/tactical/$kebab_filename" ;;
        "Architecture Design") target="openspec/specs/architecture/$kebab_filename" ;;
        "AI Implementation Research") target="openspec/specs/research/ai-implementation/$kebab_filename" ;;
        "Technical Research") target="openspec/specs/research/technical/$kebab_filename" ;;
        "Process Documentation") target="openspec/specs/_global/process/$kebab_filename" ;;
        *) target="openspec/specs/_uncategorized/$kebab_filename" ;;
    esac
    
    # Determine status
    case "$priority" in
        "High") status="Migrate" ;;
        "Medium") status="Review" ;;
        "Low") status="Exclude" ;;
        *) status="Review" ;;
    esac
    
    # Generate notes
    notes=""
    if [ "$status" = "Exclude" ]; then
        notes="Low priority or specific documentation"
    fi
    
    # Write to CSV
    echo "\"$file\",$file_size,$last_modified,$language,$category,$priority,\"$target\",$status,\"$notes\"" >> "$OUTPUT_FILE"
    
    ((processed_files++))
    
    # Progress indicator
    if (( processed_files % 20 == 0 )); then
        echo "Processed $processed_files files..."
    fi
done

# Generate summary
echo "## Inventory Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- **Total files found**: $total_files" >> "$REPORT_FILE"
echo "- **Files processed**: $processed_files" >> "$REPORT_FILE"
echo "- **Inventory file**: [$OUTPUT_FILE]($OUTPUT_FILE)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Inventory generation complete!"
echo "Total files: $total_files"
echo "Processed files: $processed_files"
echo "Output file: $OUTPUT_FILE"
echo "Report file: $REPORT_FILE"