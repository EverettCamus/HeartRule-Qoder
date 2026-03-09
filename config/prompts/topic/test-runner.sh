#!/bin/bash

# HeartRule Prompt测试框架 - 测试运行器
# 支持实践导向的迭代开发工作流：测试 → 分析 → 优化 → 重测

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DATA_DIR="${SCRIPT_DIR}/test-data"
EVALUATION_CRITERIA="${SCRIPT_DIR}/test-evaluation-criteria.md"
DECISION_PROMPT="${SCRIPT_DIR}/../decision-llm-v1-draft.md"
PLANNER_PROMPT="${SCRIPT_DIR}/../planner-llm-v1-draft.md"
OUTPUT_DIR="${SCRIPT_DIR}/test-results"
LOG_FILE="${OUTPUT_DIR}/test-run-$(date +%Y%m%d-%H%M%S).log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 工具检查
check_tools() {
    echo -e "${BLUE}检查必要工具...${NC}"
    
    local missing_tools=()
    
    # 检查jq
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    # 检查yq (YAML处理)
    if ! command -v yq &> /dev/null; then
        echo -e "${YELLOW}警告: yq未安装，YAML验证功能受限${NC}"
    fi
    
    # 检查curl
    if ! command -v curl &> /dev/null; then
        missing_tools+=("curl")
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        echo -e "${RED}错误: 缺少必要工具: ${missing_tools[*]}${NC}"
        echo "请安装:"
        for tool in "${missing_tools[@]}"; do
            echo "  - $tool"
        done
        exit 1
    fi
    
    echo -e "${GREEN}✓ 所有必要工具已安装${NC}"
}

# 初始化
init() {
    echo -e "${BLUE}初始化测试环境...${NC}"
    
    # 创建输出目录
    mkdir -p "${OUTPUT_DIR}"
    
    # 检查测试数据
    if [ ! -d "${TEST_DATA_DIR}" ]; then
        echo -e "${RED}错误: 测试数据目录不存在: ${TEST_DATA_DIR}${NC}"
        exit 1
    fi
    
    # 检查提示词文件
    if [ ! -f "${DECISION_PROMPT}" ]; then
        echo -e "${YELLOW}警告: 决策提示词文件不存在: ${DECISION_PROMPT}${NC}"
    fi
    
    if [ ! -f "${PLANNER_PROMPT}" ]; then
        echo -e "${YELLOW}警告: 规划提示词文件不存在: ${PLANNER_PROMPT}${NC}"
    fi
    
    echo -e "${GREEN}✓ 测试环境初始化完成${NC}"
}

# 记录日志
log() {
    local message="$1"
    local level="${2:-INFO}"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# 运行单个测试场景
run_scenario() {
    local scenario_file="$1"
    local scenario_name=$(basename "${scenario_file}" .json)
    
    log "运行测试场景: ${scenario_name}"
    
    # 检查场景文件
    if [ ! -f "${scenario_file}" ]; then
        log "错误: 场景文件不存在: ${scenario_file}" "ERROR"
        return 1
    fi
    
    # 解析场景文件
    local scenario_data=$(cat "${scenario_file}")
    
    # 提取测试数据
    local description=$(echo "${scenario_data}" | jq -r '.description')
    local topic_config=$(echo "${scenario_data}" | jq -c '.topic_config')
    local conversation_history=$(echo "${scenario_data}" | jq -c '.conversation_history')
    local existing_entities=$(echo "${scenario_data}" | jq -c '.existing_entities')
    
    log "场景描述: ${description}"
    
    # 构建决策提示词输入
    local decision_input=$(build_decision_input "${scenario_data}")
    
    # 调用决策LLM（模拟）
    local decision_output=$(call_decision_llm "${decision_input}")
    
    # 验证决策输出
    local decision_validation=$(validate_decision_output "${decision_output}" "${scenario_file}")
    
    # 如果决策需要调整，调用规划LLM
    local needs_adjustment=$(echo "${decision_output}" | jq -r '.needsAdjustment // false')
    
    local planner_output="{}"
    local planner_validation="{}"
    
    if [ "${needs_adjustment}" = "true" ]; then
        log "决策需要调整，调用规划LLM"
        
        # 构建规划提示词输入
        local planner_input=$(build_planner_input "${decision_output}" "${scenario_data}")
        
        # 调用规划LLM（模拟）
        planner_output=$(call_planner_llm "${planner_input}")
        
        # 验证规划输出
        planner_validation=$(validate_planner_output "${planner_output}" "${scenario_file}")
    else
        log "决策不需要调整，跳过规划阶段"
    fi
    
    # 生成测试报告
    generate_report "${scenario_name}" "${scenario_data}" "${decision_output}" \
                    "${decision_validation}" "${planner_output}" "${planner_validation}"
    
    log "测试场景完成: ${scenario_name}"
}

# 构建决策提示词输入
build_decision_input() {
    local scenario_data="$1"
    
    # 提取必要字段
    local topic_config=$(echo "${scenario_data}" | jq -c '.topic_config')
    local conversation_history=$(echo "${scenario_data}" | jq -c '.conversation_history')
    local existing_entities=$(echo "${scenario_data}" | jq -c '.existing_entities')
    
    # 构建输入JSON
    local input_json=$(cat <<EOF
{
  "topic_config": ${topic_config},
  "conversation_history": ${conversation_history},
  "existing_entities": ${existing_entities},
  "system_variables": {
    "time": "$(date '+%Y-%m-%d %H:%M:%S')",
    "session_id": "test-session-$(date +%s)",
    "user_id": "test-user"
  }
}
EOF
)
    
    echo "${input_json}"
}

# 调用决策LLM（模拟）
call_decision_llm() {
    local input="$1"
    
    log "调用决策LLM（模拟）"
    
    # 在实际实现中，这里会调用真正的LLM API
    # 目前返回场景中的期望输出作为模拟
    
    # 从输入中提取场景标识（简化实现）
    local conversation_history=$(echo "${input}" | jq -r '.conversation_history[0].content // ""')
    
    # 根据对话内容选择模拟响应
    local simulated_output
    
    if echo "${conversation_history}" | grep -q "妈妈也回来了\|外公也经常来帮忙"; then
        # 新实体场景
        simulated_output=$(cat "${TEST_DATA_DIR}/new-entities-scenario.json" | jq -c '.expected_decision_output')
    elif echo "${conversation_history}" | grep -q "有时候我晚上都见不到他"; then
        # 深化实体场景
        simulated_output=$(cat "${TEST_DATA_DIR}/deepen-entity-scenario.json" | jq -c '.expected_decision_output')
    elif echo "${conversation_history}" | grep -q "我不想谈爷爷"; then
        # 跳过实体场景
        simulated_output=$(cat "${TEST_DATA_DIR}/skip-entity-scenario.json" | jq -c '.expected_decision_output')
    else
        # 默认：不需要调整
        simulated_output='{"needsAdjustment": false, "reasoning": "测试默认响应"}'
    fi
    
    echo "${simulated_output}"
}

# 验证决策输出
validate_decision_output() {
    local actual_output="$1"
    local scenario_file="$2"
    
    log "验证决策输出"
    
    # 获取期望输出
    local expected_output=$(cat "${scenario_file}" | jq -c '.expected_decision_output')
    
    # 验证JSON结构
    local validation_result=$(cat <<EOF
{
  "is_valid_json": true,
  "has_required_fields": true,
  "strategy_valid": true,
  "needs_adjustment_correct": true,
  "matches_expected": false,
  "issues": []
}
EOF
)
    
    # 检查JSON有效性
    if ! echo "${actual_output}" | jq . > /dev/null 2>&1; then
        validation_result=$(echo "${validation_result}" | jq '.is_valid_json = false')
        validation_result=$(echo "${validation_result}" | jq '.issues += ["无效的JSON格式"]')
    fi
    
    # 检查必需字段
    local required_fields=("needsAdjustment" "strategy" "reasoning" "adjustmentPlan")
    for field in "${required_fields[@]}"; do
        if ! echo "${actual_output}" | jq -e ".${field}" > /dev/null 2>&1; then
            validation_result=$(echo "${validation_result}" | jq '.has_required_fields = false')
            validation_result=$(echo "${validation_result}" | jq --arg field "$field" '.issues += ["缺少必需字段: " + $field]')
        fi
    done
    
    # 检查策略有效性
    local valid_strategies=("NEW_ENTITIES" "DEEPEN_ENTITY" "SKIP_ENTITY" "REORDER_ACTIONS" "CUSTOM")
    local actual_strategy=$(echo "${actual_output}" | jq -r '.strategy // ""')
    
    if [[ ! " ${valid_strategies[*]} " =~ " ${actual_strategy} " ]]; then
        validation_result=$(echo "${validation_result}" | jq '.strategy_valid = false')
        validation_result=$(echo "${validation_result}" | jq --arg strategy "$actual_strategy" '.issues += ["无效的策略: " + $strategy]')
    fi
    
    # 与期望输出比较（简化比较）
    local expected_needs_adjustment=$(echo "${expected_output}" | jq -r '.needsAdjustment // false')
    local actual_needs_adjustment=$(echo "${actual_output}" | jq -r '.needsAdjustment // false')
    
    if [ "${expected_needs_adjustment}" != "${actual_needs_adjustment}" ]; then
        validation_result=$(echo "${validation_result}" | jq '.needs_adjustment_correct = false')
        validation_result=$(echo "${validation_result}" | jq '.issues += ["needsAdjustment不正确"]')
    fi
    
    # 检查是否匹配期望输出
    if [ "${actual_output}" = "${expected_output}" ]; then
        validation_result=$(echo "${validation_result}" | jq '.matches_expected = true')
    fi
    
    echo "${validation_result}"
}

# 构建规划提示词输入
build_planner_input() {
    local decision_output="$1"
    local scenario_data="$2"
    
    # 提取必要字段
    local topic_config=$(echo "${scenario_data}" | jq -c '.topic_config')
    local adjustment_plan_json="${decision_output}"
    
    # 构建输入JSON
    local input_json=$(cat <<EOF
{
  "topic_config": ${topic_config},
  "adjustment_plan_json": ${adjustment_plan_json},
  "system_variables": {
    "time": "$(date '+%Y-%m-%d %H:%M:%S')",
    "session_id": "test-session-$(date +%s)"
  }
}
EOF
)
    
    echo "${input_json}"
}

# 调用规划LLM（模拟）
call_planner_llm() {
    local input="$1"
    
    log "调用规划LLM（模拟）"
    
    # 从决策输出中提取策略类型
    local adjustment_plan_json=$(echo "${input}" | jq -r '.adjustment_plan_json')
    local strategy=$(echo "${adjustment_plan_json}" | jq -r '.strategy // ""')
    
    # 根据策略选择模拟响应
    local simulated_output
    
    case "${strategy}" in
        "NEW_ENTITIES")
            simulated_output=$(cat "${TEST_DATA_DIR}/new-entities-scenario.json" | jq -c '.expected_planner_output')
            ;;
        "DEEPEN_ENTITY")
            simulated_output=$(cat "${TEST_DATA_DIR}/deepen-entity-scenario.json" | jq -c '.expected_planner_output')
            ;;
        "SKIP_ENTITY")
            simulated_output=$(cat "${TEST_DATA_DIR}/skip-entity-scenario.json" | jq -c '.expected_planner_output')
            ;;
        *)
            simulated_output='{"actions": []}'
            ;;
    esac
    
    echo "${simulated_output}"
}

# 验证规划输出
validate_planner_output() {
    local actual_output="$1"
    local scenario_file="$2"
    
    log "验证规划输出"
    
    # 获取期望输出
    local expected_output=$(cat "${scenario_file}" | jq -c '.expected_planner_output')
    
    # 验证YAML结构（简化验证）
    local validation_result=$(cat <<EOF
{
  "is_valid_yaml": true,
  "has_actions_array": true,
  "action_ids_valid": true,
  "variable_names_valid": true,
  "matches_expected": false,
  "issues": []
}
EOF
)
    
    # 检查是否有actions数组
    if ! echo "${actual_output}" | jq -e '.actions' > /dev/null 2>&1; then
        validation_result=$(echo "${validation_result}" | jq '.has_actions_array = false')
        validation_result=$(echo "${validation_result}" | jq '.issues += ["缺少actions数组"]')
    fi
    
    # 检查Action ID格式（简化检查）
    local action_ids=$(echo "${actual_output}" | jq -r '.actions[].action_id // ""' | grep -v '^$')
    
    for action_id in ${action_ids}; do
        if [[ ! "${action_id}" =~ ^[a-z]+_[0-9]+_[a-z_]+$ ]]; then
            validation_result=$(echo "${validation_result}" | jq '.action_ids_valid = false')
            validation_result=$(echo "${validation_result}" | jq --arg id "$action_id" '.issues += ["无效的Action ID格式: " + $id]')
        fi
    done
    
    # 检查是否匹配期望输出
    if [ "${actual_output}" = "${expected_output}" ]; then
        validation_result=$(echo "${validation_result}" | jq '.matches_expected = true')
    fi
    
    echo "${validation_result}"
}

# 生成测试报告
generate_report() {
    local scenario_name="$1"
    local scenario_data="$2"
    local decision_output="$3"
    local decision_validation="$4"
    local planner_output="$5"
    local planner_validation="$6"
    
    local report_file="${OUTPUT_DIR}/${scenario_name}-report-$(date +%Y%m%d-%H%M%S).json"
    
    # 计算分数（简化计算）
    local decision_score=0
    local planner_score=0
    
    # 决策分数
    if [ "$(echo "${decision_validation}" | jq -r '.is_valid_json')" = "true" ]; then
        decision_score=$((decision_score + 25))
    fi
    if [ "$(echo "${decision_validation}" | jq -r '.has_required_fields')" = "true" ]; then
        decision_score=$((decision_score + 25))
    fi
    if [ "$(echo "${decision_validation}" | jq -r '.strategy_valid')" = "true" ]; then
        decision_score=$((decision_score + 25))
    fi
    if [ "$(echo "${decision_validation}" | jq -r '.needs_adjustment_correct')" = "true" ]; then
        decision_score=$((decision_score + 25))
    fi
    
    # 规划分数
    if [ "$(echo "${planner_validation}" | jq -r '.is_valid_yaml')" = "true" ]; then
        planner_score=$((planner_score + 25))
    fi
    if [ "$(echo "${planner_validation}" | jq -r '.has_actions_array')" = "true" ]; then
        planner_score=$((planner_score + 25))
    fi
    if [ "$(echo "${planner_validation}" | jq -r '.action_ids_valid')" = "true" ]; then
        planner_score=$((planner_score + 25))
    fi
    if [ "$(echo "${planner_validation}" | jq -r '.variable_names_valid')" = "true" ]; then
        planner_score=$((planner_score + 25))
    fi
    
    # 总体分数
    local overall_score=$(( (decision_score + planner_score) / 2 ))
    
    # 生成报告
    local report=$(cat <<EOF
{
  "test_run": {
    "scenario": "${scenario_name}",
    "timestamp": "$(date -Iseconds)",
    "description": "$(echo "${scenario_data}" | jq -r '.description')"
  },
  "scores": {
    "decision": ${decision_score},
    "planner": ${planner_score},
    "overall": ${overall_score}
  },
  "validation": {
    "decision": ${decision_validation},
    "planner": ${planner_validation}
  },
  "outputs": {
    "decision": ${decision_output},
    "planner": ${planner_output}
  },
  "recommendations": [
    "检查决策输出是否符合JSON Schema",
    "验证规划输出的YAML格式",
    "确保Action ID遵循命名规范"
  ]
}
EOF
)
    
    echo "${report}" | jq . > "${report_file}"
    
    log "测试报告已生成: ${report_file}"
    
    # 打印摘要
    echo -e "\n${BLUE}=== 测试摘要 ===${NC}"
    echo -e "场景: ${scenario_name}"
    echo -e "决策分数: ${decision_score}/100"
    echo -e "规划分数: ${planner_score}/100"
    echo -e "总体分数: ${overall_score}/100"
    
    if [ ${overall_score} -ge 80 ]; then
        echo -e "${GREEN}✓ 测试通过${NC}"
    elif [ ${overall_score} -ge 60 ]; then
        echo -e "${YELLOW}⚠ 测试警告 - 需要改进${NC}"
    else
        echo -e "${RED}✗ 测试失败${NC}"
    fi
}

# 运行所有测试
run_all_tests() {
    log "开始运行所有测试"
    
    local total_scenarios=0
    local passed_scenarios=0
    
    # 查找所有测试场景
    local scenario_files=("${TEST_DATA_DIR}"/*.json)
    
    if [ ${#scenario_files[@]} -eq 0 ]; then
        log "错误: 未找到测试场景文件" "ERROR"
        return 1
    fi
    
    for scenario_file in "${scenario_files[@]}"; do
        if [[ "${scenario_file}" == *"template.json" ]]; then
            continue
        fi
        
        total_scenarios=$((total_scenarios + 1))
        
        # 运行场景
        if run_scenario "${scenario_file}"; then
            passed_scenarios=$((passed_scenarios + 1))
        fi
        
        echo "" # 空行分隔
    done
    
    # 汇总报告
    echo -e "\n${BLUE}=== 测试汇总 ===${NC}"
    echo -e "总场景数: ${total_scenarios}"
    echo -e "通过场景: ${passed_scenarios}"
    echo -e "失败场景: $((total_scenarios - passed_scenarios))"
    
    if [ ${passed_scenarios} -eq ${total_scenarios} ]; then
        echo -e "${GREEN}✓ 所有测试通过${NC}"
        return 0
    else
        echo -e "${RED}✗ 部分测试失败${NC}"
        return 1
    fi
}

# 清理测试结果
cleanup() {
    local days_to_keep="${1:-7}"
    
    log "清理${days_to_keep}天前的测试结果"
    
    find "${OUTPUT_DIR}" -name "*.json" -type f -mtime +${days_to_keep} -delete
    find "${OUTPUT_DIR}" -name "*.log" -type f -mtime +${days_to_keep} -delete
    
    log "清理完成"
}

# 显示帮助
show_help() {
    cat <<EOF
HeartRule Prompt测试框架 - 测试运行器

用法: $0 [选项]

选项:
  --all              运行所有测试场景
  --scenario NAME    运行指定测试场景
  --cleanup [DAYS]   清理旧的测试结果（默认: 7天）
  --help             显示此帮助信息

示例:
  $0 --all                    # 运行所有测试
  $0 --scenario new-entities # 运行新实体场景测试
  $0 --cleanup 30            # 清理30天前的测试结果

工作流:
  1. 测试: 运行测试收集数据
  2. 分析: 分析测试结果识别问题
  3. 优化: 优化提示词模板
  4. 重测: 重新运行测试验证改进

测试数据位置: ${TEST_DATA_DIR}
测试结果位置: ${OUTPUT_DIR}
EOF
}

# 主函数
main() {
    # 检查参数
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    # 初始化
    check_tools
    init
    
    # 解析参数
    case "$1" in
        --all)
            run_all_tests
            ;;
        --scenario)
            if [ -z "$2" ]; then
                echo -e "${RED}错误: 请指定场景名称${NC}"
                exit 1
            fi
            
            local scenario_file="${TEST_DATA_DIR}/$2.json"
            if [ ! -f "${scenario_file}" ]; then
                scenario_file="${TEST_DATA_DIR}/$2-scenario.json"
            fi
            
            if [ ! -f "${scenario_file}" ]; then
                echo -e "${RED}错误: 未找到场景文件: $2${NC}"
                exit 1
            fi
            
            run_scenario "${scenario_file}"
            ;;
        --cleanup)
            local days="${2:-7}"
            cleanup "${days}"
            ;;
        --help)
            show_help
            ;;
        *)
            echo -e "${RED}错误: 未知选项: $1${NC}"
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"