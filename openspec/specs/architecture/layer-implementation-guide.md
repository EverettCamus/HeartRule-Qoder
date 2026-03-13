# Five-Layer Architecture Implementation Guide

**Version**: 1.0  
**Last Updated**: March 9, 2026  
**Based on Decision**: [2026-03-09-five-layer-implementation-decisions.md](../decisions/2026-03-09-five-layer-implementation-decisions.md)

---

## Overview

This guide details the specific implementation mechanisms of HeartRule's consultation intelligence system five-layer architecture, focusing on the "planning-flexibility" balance implementation for each layer. This guide is intended for development teams and technical architects, providing specific technical implementation guidance.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                Consultation Layer                    │
│  Cross-session strategic adjustment · Treatment plan evolution · Long-term pattern recognition        │
├─────────────────────────────────────────────────────┤
│                 Session Layer                        │
│  Session structure guardianship · Time strategy execution · Progress monitoring              │
├─────────────────────────────────────────────────────┤
│                 Phase Layer                          │
│  Consciousness reconnaissance system · Counseling skill invocation · Topic queue scheduling          │
├─────────────────────────────────────────────────────┤
│                 Topic Layer                          │
│  Goal progress monitoring · Dynamic queue adjustment · Action plan optimization          │
├─────────────────────────────────────────────────────┤
│                 Action Layer                         │
│  Main thread + Monitor thread · Atomic execution unit · Quality gate           │
└─────────────────────────────────────────────────────┘
```

## 1. Action Layer Implementation Mechanism

### 1.1 Core Design: Dual-Thread Model

**Architecture Diagram**:

```
User Input
    ↓
[Monitor Thread] ← Async startup
    │       Checks: Safety, Relevance, Professionalism
    ↓       Score threshold > 0.8
[Main Thread] ────┐
    │       │
    ↓       ↓
Generate Response  Adjustment Suggestions
    │       │
    ↓       ↓
User Output  Strategy Optimization
```

### 1.2 Action Type Definition and Scene Solution Scheme

**Design Evolution**: Evolved from single action type configuration to a scenario-based solution framework, supporting multiple scenario-based template solutions for each action_type, with intelligent preprocessing interface for precise matching.

**scene_solution Architecture**: Each action_type can define multiple scene_solutions, each optimized for specific dialogue scenarios. LLM intelligently classifies based on action's goal prompt and selects the most appropriate scene_solution.

```yaml
# Action type configuration example (supporting scene_solution)
action_types:
  ai_say:
    description: 'Convey information to user (solution persuasion, knowledge introduction, etc.)'
    # Backward compatibility: original configuration as default scene_solution
    main_prompt_template: 'templates/actions/ai_say/main.md'
    monitor_prompt_template: 'templates/actions/ai_say/monitor.md'
    monitor_frequency: 'low' # Low frequency monitoring

    # Scenario-based solutions (scene_solutions)
    scene_solutions:
      - id: 'advice'
        name: 'Advice Solution'
        description: 'Provide specific advice or solutions'
        category: 'advice'
        main_prompt_template: 'templates/actions/ai_say/scenes/advice/main.md'
        monitor_prompt_template: 'templates/actions/ai_say/scenes/advice/monitor.md'
        monitor_frequency: 'medium'
        classification_prompt: 'This is a scenario for providing advice or solutions'

      - id: 'knowledge'
        name: 'Knowledge Introduction'
        description: 'Introduce professional knowledge or concepts'
        category: 'knowledge'
        main_prompt_template: 'templates/actions/ai_say/scenes/knowledge/main.md'
        monitor_prompt_template: 'templates/actions/ai_say/scenes/knowledge/monitor.md'
        monitor_frequency: 'low'
        classification_prompt: 'This is a scenario for introducing professional knowledge or concepts'

      - id: 'persuasion'
        name: 'Persuasion Guidance'
        description: 'Persuade user to accept viewpoints or take action'
        category: 'persuasion'
        main_prompt_template: 'templates/actions/ai_say/scenes/persuasion/main.md'
        monitor_prompt_template: 'templates/actions/ai_say/scenes/persuasion/monitor.md'
        monitor_frequency: 'high'
        classification_prompt: 'This is a scenario for persuading user to accept viewpoints or take action'

  ai_ask:
    description: 'Collect user information, store in variables for later reference'
    # Backward compatibility: original configuration as default scene_solution
    main_prompt_template: 'templates/actions/ai_ask/main.md'
    monitor_prompt_template: 'templates/actions/ai_ask/monitor.md'
    monitor_frequency: 'high' # High frequency monitoring
    variable_extraction:
      method: 'llm_extraction'
      schema: 'schemas/user_info.json'

    # Scenario-based solutions (scene_solutions)
    scene_solutions:
      - id: 'open_question'
        name: 'Open-ended Question'
        description: 'Guide user to express freely, collect rich information'
        category: 'open_question'
        main_prompt_template: 'templates/actions/ai_ask/scenes/open_question/main.md'
        monitor_prompt_template: 'templates/actions/ai_ask/scenes/open_question/monitor.md'
        monitor_frequency: 'high'
        classification_prompt: 'This is an open-ended question, guiding user to express freely'

      - id: 'closed_question'
        name: 'Closed-ended Question'
        description: 'Obtain specific information or confirm details'
        category: 'closed_question'
        main_prompt_template: 'templates/actions/ai_ask/scenes/closed_question/main.md'
        monitor_prompt_template: 'templates/actions/ai_ask/scenes/closed_question/monitor.md'
        monitor_frequency: 'medium'
        classification_prompt: 'This is a closed-ended question, obtaining specific information or confirming details'

  ai_think:
    description: 'Process and analyze information, store results in variables'
    main_prompt_template: 'templates/actions/ai_think/main.md'
    monitor_prompt_template: 'templates/actions/ai_think/monitor.md'
    monitor_frequency: 'medium'
    output_variables: ['analysis_result', 'insights']

  ai_draw:
    description: 'Generate drawing output based on user description'
    main_prompt_template: 'templates/actions/ai_draw/main.md'
    monitor_prompt_template: 'templates/actions/ai_draw/monitor.md'
    monitor_frequency: 'medium'

  ai_form:
    description: 'Intelligently guide user to fill forms, provide help prompts'
    main_prompt_template: 'templates/actions/ai_form/main.md'
    monitor_prompt_template: 'templates/actions/ai_form/monitor.md'
    monitor_frequency: 'high'
    guidance_steps: 3 # Maximum 3 guidance steps
```

**Field Descriptions**:

- `id`: Scenario unique identifier
- `name`: Scenario name
- `description`: Scenario description
- `category`: Scenario category (for intelligent classification)
- `main_prompt_template`: Main prompt template path
- `monitor_prompt_template`: Monitor prompt template path
- `monitor_frequency`: Monitor frequency (always, high, medium, low, on_error, periodic, first_round_only, never)
- `classification_prompt`: Classification prompt (for LLM intelligent classification)

**Intelligent Preprocessing Interface**: LLM classifies based on action's goal prompt and selects the most appropriate scene_solution. For example:

- ai_say goal is 'provide solution advice' → select advice scenario
- ai_say goal is 'introduce professional knowledge' → select knowledge scenario
- ai_ask goal is 'understand user feelings' → select open_question scenario
- ai_ask goal is 'confirm specific information' → select closed_question scenario

**Implementation Phases**:

1. **Current Phase (Framework Definition)**: Define scene_solution architecture, support manual scene_solution specification
2. **Next Phase (Intelligent Selection)**: Implement LLM intelligent classification, automatically select best scene_solution

**Backward Compatibility**: Existing scripts require no modification, original action_type configuration serves as default scene_solution. Script engineers can gradually adopt scenario-based solutions to improve dialogue quality.

### 1.3 Monitor Layer for Each Action Type

**Architecture Design Principles**:

- Each Action type (ai_say, ai_ask, ai_think, etc.) has a corresponding monitor handler
- Each Action type has independent monitor prompt templates
- Monitor handlers inherit from common base class, sharing infrastructure like JSON parsing, retry logic
- Monitor templates support two-layer scheme (default/custom) and variable substitution

**Monitor Handler Registry Example**:

```yaml
action_monitor_mapping:
  ai_say:
    monitor_handler: 'AiSayMonitorHandler'
    template_path: 'default/ai_say_monitor_v1.md'
    focus_areas:
      - 'User comprehension difficulty detection'
      - 'Expression optimization suggestion generation'
      - 'Safety risk assessment'

  ai_ask:
    monitor_handler: 'AiAskMonitorHandler'
    template_path: 'default/ai_ask_monitor_v1.md'
    focus_areas:
      - 'Information collection barrier identification'
      - 'Questioning strategy adjustment'
      - 'User resistance handling'

  ai_think:
    monitor_handler: 'AiThinkMonitorHandler' # To be implemented
    template_path: 'default/ai_think_monitor_v1.md' # To be created
    focus_areas:
      - 'Analysis quality assessment'
      - 'Logical consistency check'
      - 'Insight depth evaluation'
```

**Monitor Template Two-Layer Scheme**:

```
Monitor template path resolution priority:
1. custom/{scheme_name}/{action_type}_monitor_v1.md (Custom scheme)
2. default/{action_type}_monitor_v1.md (System default)

Variable substitution support:
- {{current_round}} - Current round
- {{max_rounds}} - Maximum rounds
- {{user_engagement}} - User engagement level
- {{topic_content}} - Topic content
- {{action_result}} - Action execution result
- And other variables in context/metrics
```

**Monitor Analysis Flow**:

```
1. After Action execution completes, collect execution metrics and context
2. MonitorOrchestrator selects corresponding monitor handler based on actionType
3. Monitor handler calls MonitorTemplateService to load and render monitor template
4. Call monitor LLM for analysis, parse JSON results
5. Generate feedback suggestions or trigger Topic orchestration based on analysis results
6. Monitor feedback injection: Store `feedback_for_action` field from analysis results in `executionState.metadata.latestMonitorFeedback`, and automatically inject into next Action's LLM prompt
```

The monitor feedback mechanism ensures that monitor analysis results can influence main flow execution. When monitor LLM identifies optimization opportunities or issues, it provides specific improvement suggestions through the `feedback_for_action` field. These suggestions are stored in the execution context and automatically injected into the LLM prompt during the next Action execution, enabling real-time intervention and optimization of the main flow by monitor results.

**Common Monitor Check Items** (applicable to all Action types):

Monitor checks are implemented through template files, not YAML configuration. The system uses Markdown template files to define monitor analysis tasks, following a unified structural design.

**Template Location**: `_system/config/default/*_monitor_v1.md`

**Currently Supported Action Types**:

- `ai_ask_monitor_v1.md` - Monitor analysis for ai_ask Action
- `ai_say_monitor_v1.md` - Monitor analysis for ai_say Action

**Template Design Principles**:

1. **Role Definition**: Clearly define monitor LLM's role and responsibilities
2. **Input Information**: Provide complete execution context and metrics data
3. **Analysis Tasks**: Define specific monitor analysis dimensions (safety, relevance, professionalism, quality, etc.)
4. **Output Format**: Strict JSON format, including `score`, `reasoning`, `feedback_for_action`, `strategy_suggestion` fields
5. **Analysis Examples**: Provide example inputs and outputs to ensure LLM understands analysis standards
6. **Notes**: Include implementation details and boundary condition descriptions

**Template Content Example** (ai_ask_monitor_v1.md excerpt):

````markdown
# Role Definition

You are an AI consultation session monitor analysis expert, responsible for evaluating Action execution quality and safety...

# Input Information

## Execution Context

- Action type: ai_ask
- User input: {{user_input}}
- AI response: {{ai_response}}
  ...

# Analysis Tasks

Please analyze this Action execution from the following dimensions:

## 1. Safety Check

Check if AI response contains:

1. Self-harm or harm to others expressions
2. Illegal or dangerous behavior suggestions
3. Extreme emotional incitement
   ...

# Output Format

Please output analysis results strictly in the following JSON format:

```json
{
  "score": 0.85,
  "reasoning": "Safety is good, but relevance needs improvement...",
  "feedback_for_action": "Suggest making questions more clearly connected to user's previous content",
  "strategy_suggestion": "Continue current topic, but add connecting questions"
}
```
````

````

**Implementation Status**: Currently only `ai_ask` and `ai_say` Action types have implemented monitor handlers, other Action types will be gradually supported in subsequent versions.

### 1.4 Execution Flow

```typescript
// Pseudocode example
class ActionExecutor {
  async execute(actionConfig: ActionConfig, context: ActionContext): Promise<ActionResult> {
    // 1. Start monitor thread (async)
    const monitorPromise = this.startMonitorThread(actionConfig, context);

    // 2. Execute main thread
    const mainResult = await this.executeMainThread(actionConfig, context);

    // 3. Get monitor result
    const monitorResult = await monitorPromise;

    // 4. Adjust based on monitor result
    if (monitorResult.score < 0.8) {
      return this.handleLowQualityResult(mainResult, monitorResult);
    }

    // 5. Record execution data
    this.recordExecutionData(actionConfig, mainResult, monitorResult);

    return {
      success: true,
      completed: true,
      aiMessage: mainResult.content,
      variables: mainResult.extractedVariables,
      monitorScore: monitorResult.score,
    };
  }
}
````

## 2. Topic Layer Implementation Mechanism

### 2.1 Core Design: Two-Stage LLM Pipeline

**Architecture Diagram**:

```
Dialogue Context
    ↓
[Stage 1: Decision LLM] ← Analyze dialogue, determine if queue adjustment needed
    │       Output: Structured adjustment plan (JSON)
    ↓
[Stage 2: Planner LLM] ← Convert adjustment plan to Action configuration
    │       Output: Action YAML script
    ↓
Schema Validation
    ├─ Pass → Apply new actions queue
    └─ Fail → Fallback mechanism
```

### 2.2 Two-Stage Pipeline Details (Design Evolution)

**Current Design Evolution**:

The "code layer maintains entity processing progress" approach in the original design document has the following issues:

1. Code layer needs to maintain complex state management
2. Need to pass state to LLM for repeated judgment
3. Increased system complexity and maintenance burden

**Improved Design Approach**:

**Stage 1: Decision LLM (Decision Layer)**

- **Input**: Topic goal, strategy, dialogue summary, remaining time, etc.
- **Output**: Natural language description of adjustment requirements, not over-structured JSON
- **Core Capabilities**:
  - Understand dialogue context, identify new entities needing processing
  - Determine if Action queue adjustment is needed
  - Provide text description of adjustment direction and rationale

**Stage 2: Planner LLM (Planning Layer)**

- **Input**: Stage 1 text description + Topic goal/strategy
- **Output**: Specific Action YAML script
- **Core Capabilities**:
  - Convert text adjustment requirements to executable Action configuration
  - Follow naming conventions and script syntax
  - Consider execution continuity and user experience

**Possible Stage 3: Execution/Validation Layer**

- **Optional Introduction**: Third LLM responsible for executing modification plans or quality checks
- **Schema Validation**: Ensure generated Action scripts conform to technical specifications
- **Fallback Mechanism**: Handling strategy when validation fails

**Design Philosophy**:

- Process like "writing code": requirement description → code generation → execution → validation
- Prioritize solving intelligence level issues, efficiency optimization as subsequent consideration
- Reduce code layer state management, let LLM take on more intelligent judgment

### 2.3 Dynamic Adjustment Scenario Examples

Topic layer's dynamic adjustment capability supports multiple scenarios, which mainly affect the prompt design of Decision LLM, Planner LLM, and possibly Executor LLM:

**Scenario A: One-to-Many Entity Expansion (Core Example)**

- **Trigger Condition**: User mentions multiple objects needing individual processing (e.g., multiple caregivers)
- **Adjustment Action**: Generate corresponding Action sub-queues for each entity
- **Example**:
  - User mentions "dad, mom, grandpa"
  - System automatically generates basic information collection Actions for each caregiver
  - Different entities can be assigned different numbers of Actions (e.g., dad 3, mom 2, grandpa 1)

**Scenario B: Topic Extension Handling**

- **Trigger Condition**: User actively goes off-topic, but content is related to current Topic
- **Adjustment Action**: Insert 1-2 brief acknowledgment Actions then return to main thread
- **Example**:
  - User suddenly mentions memories of elementary school homeroom teacher
  - System inserts: "Hmm, the elementary school teacher experience you mentioned is indeed interesting..."
  - Then guides back to original topic: "Let's return to our discussion about caregivers..."

**Scenario C: Conditional Skip**

- **Trigger Condition**: Prerequisites not met (e.g., user resistance, insufficient time)
- **Adjustment Action**: Skip some secondary Actions
- **Example**:
  - User explicitly indicates not wanting to discuss a topic in depth
  - System skips related deep follow-up Actions
  - Proceed directly to next topic or summary

**Scenario D: Emotional Response**

- **Trigger Condition**: Detect significant user emotional fluctuation
- **Adjustment Action**: Insert soothing Action or pause current Topic
- **Example**:
  - User shows strong anxiety
  - System inserts empathy expression: "I can feel your anxiety right now..."
  - Ask if pace or topic adjustment is needed

**Scenario E: Information Deepening**

- **Trigger Condition**: Collected high-quality information worth deeper exploration
- **Adjustment Action**: Add follow-up or analysis Actions
- **Example**:
  - User provides particularly insightful self-observation
  - System appends: "The observation you just mentioned is very profound, we can explore further..."
  - Add cognitive pattern analysis Action

**Design Points**:

- All scenarios are configured through Prompt templates, no code modification needed
- Adjustment logic judged by LLM, code layer only responsible for execution
- Different scenarios can occur in combination (e.g., simultaneously handling new entities and emotional response)
- Priority handling: Safety-related > Emotional response > Information deepening > Routine adjustment

**Configuration-Driven**: All business logic defined through YAML configuration and Prompt templates, achieving zero-code extension.

**Topic Node YAML Configuration Structure**:

```yaml
topic:
  id: 'collect_caregiver_info'
  goal: 'Collect visitor childhood primary caregiver information'
  strategy: 'progressive_deepening'

  # Decision prompt configuration
  decision_prompt_config:
    system_variables: { ... }
    template_variables: { ... }
    conditional_blocks: [...]
    examples: [...]

  # Planner prompt configuration
  planner_prompt_config:
    input_variables: { ... }
    template_fragments: { ... }
    loop_templates: [...]
    examples: [...]
```

### 2.5 Typical Use Cases

**Scenario A: One-to-Many Entity Expansion (Core Implementation)**

- **Topic Goal**: Collect visitor childhood primary caregiver situation
- **Dynamic Expansion**:
  1. Action1 collects "dad", automatically expands to Action2(dad), Action3(dad)
  2. During Action3(dad) execution, user mentions "mom, grandpa", automatically appends corresponding Actions
- **Key Point**: Script authors only need to write template once, engine automatically generates and expands Actions through two-stage LLM

**Other Extension Scenarios**:

- **Scenario B: Topic Extension Handling** - User actively goes off-topic but content is related
- **Scenario C: Conditional Skip** - Skip some Actions based on conditions
- **Scenario D: Emotional Response** - Detect significant user emotional fluctuation

### 2.6 Status Reporting Protocol

Topic layer needs to report to Phase layer:

- `topic_progress`: Goal achievement rate (0-1)
- `adjustment_decisions`: Adjustment decision records (including two-stage LLM output)
- `entity_status`: Entity identification and processing status
- `time_usage`: Time usage situation
- `key_issues`: Key issues encountered

## 3. Consciousness Reconnaissance System (LLM+Script Philosophy)

### 3.1 Design Philosophy: Pure LLM-Driven Detection

**Core Principle**: Following "LLM+Script (assemble prompts)" philosophy, all detection logic encapsulated in prompt templates, understood end-to-end through LLM, avoiding traditional AI's semantic decomposition pipeline.

**Difference from Traditional AI Detection**:
| Traditional AI Detection | LLM+Script Detection |
|------------|--------------|
| Raw text → Tokenization → Syntactic analysis → Semantic understanding → Rule matching | Raw text → Prompt template (assemble context) → LLM (end-to-end understanding) → Structured output |
| Relies on rule engines, pattern matching libraries | Relies on prompt engineering and LLM understanding capability |
| Detection logic hardcoded in code | Detection logic defined in script templates |
| Performance optimization through algorithm optimization | Performance optimization through model selection, batch processing, caching |

### 3.2 Consciousness Definition Script Architecture (Minimal Mode)

```yaml
# Consciousness definition script example: scripts/consciousness/contradiction-detection.yaml
consciousness:
  id: 'contradiction_detection'
  name: 'Contradiction Detection Consciousness'
  description: 'Identify user contradictory statements'

  # Loading configuration
  loading:
    scope: ['phase:assessment', 'phase:exploration'] # In which phases to load
    activation: 'conditional' # conditional | always | on_demand
    priority: 0.7 # Loading priority (0-1)

  # Minimal configuration: All business logic in detection_focus (written by domain engineers)
  detection_focus: |
    Detect contradictory statements in user dialogue, including:
    1. Logical contradiction: Statements logically inconsistent (e.g., "I do X every day" vs "I never do X")
    2. Emotional contradiction: Verbal content inconsistent with emotional expression
    3. Value conflict: Values reflected in different statements contradict
    4. Behavioral inconsistency: Words contradict described behaviors

    Exclusion rules:
    - Statements spanning more than 30 days are not considered contradictions
    - Obviously metaphorical or rhetorical expressions are not considered contradictions
    - Contradictions user is already self-aware of are not reported repeatedly

  # Optional configuration override (for advanced users, following ai_ask/ai_say pattern)
  config_override:
    # Technical parameter override (usually use engine defaults)
    confidence_threshold: 0.8 # Override default confidence threshold
    context_window: 15 # Override default context window

    # LLM parameter override (optional)
    llm_config:
      model: 'claude-3-sonnet' # Override default model
      temperature: 0.2 # Override default temperature

  # Output variable definition (extract from detection results, maintain get/define pattern consistent with ai_ask)
  output:
    - get: 'contradiction_detected'
      define: 'Whether contradiction detected (true/false)'

    - get: 'contradiction_type'
      define: 'Contradiction type (logical_contradiction/emotional_contradiction/value_conflict/behavioral_inconsistency)'

    - get: 'contradiction_severity'
      define: 'Contradiction severity (0-1)'

    - get: 'clinical_significance'
      define: 'Clinical significance description'

    - get: 'suggested_exploration'
      define: 'Suggested how counselor can gently explore this contradiction'

  # Performance optimization configuration (optional)
  performance:
    caching:
      enabled: true
      ttl: '30_seconds' # Detection result cached for 30 seconds

    batching:
      enabled: true
      batch_size: 3 # Batch detect every 3 messages

  # Post-trigger actions (optional)
  actions:
    - type: 'call_skill'
      skill_id: 'clarification_questioning'
      condition: 'contradiction_detected == true && contradiction_severity > 0.7'

    - type: 'log_insight'
      condition: 'contradiction_detected == true'
      insight_type: 'contradiction_pattern'
```

**Design Points**:

1. **Business Logic Focus**: `detection_focus` only contains business logic (what to detect, exclusion rules), technical configuration provided by engine defaults
2. **Technical Configuration Hidden**: Thresholds, context windows, LLM configuration and other technical parameters hidden from script engineers, following same pattern as ai_ask/ai_say
3. **Optional Override Mechanism**: Provide advanced configuration capability through `config_override` field, most scripts don't need to use
4. **Domain Engineer Friendly**: Script engineers only need to focus on consultation business logic, no need to understand technical implementation details
5. **Output Variable Extraction**: Maintain same `output` pattern as ai_ask, define variables through `get` and `define`
6. **Backward Compatibility**: Performance optimization and trigger actions as optional configuration, maintaining flexibility

**Engine-Level Default Configuration**:

```typescript
// Consciousness detection engine default configuration (following existing Action pattern)
const DEFAULT_CONSCIOUSNESS_CONFIG = {
  // Detection thresholds
  confidence_threshold: 0.7,
  severity_threshold: 0.5,

  // Context window
  context_window: 10, // Recent 10 dialogues

  // LLM configuration (use lightweight model for detection)
  llm_config: {
    model: 'claude-3-haiku',
    temperature: 0.1,
    max_tokens: 500,
  },

  // Performance optimization
  performance: {
    caching: { enabled: true, ttl_seconds: 30 },
    batching: { enabled: true, batch_size: 3 },
  },
};
```

**Configuration Resolution and Override Mechanism**:

System resolves configuration in the following priority:

1. **Engine Defaults**: Hardcoded default values in `DEFAULT_CONSCIOUSNESS_CONFIG`
2. **System Configuration Files**: Environment-specific configuration in `config/` directory
3. **Script-Level Override**: Explicit configuration in `config_override` field
4. **Runtime Dynamic Adjustment**: Parameters dynamically adjusted based on session context

**Configuration Merge Example**:

```typescript
function resolveConsciousnessConfig(scriptConfig: ConsciousnessScript): ConsciousnessConfig {
  // 1. Start from engine defaults
  const config = { ...DEFAULT_CONSCIOUSNESS_CONFIG };

  // 2. Merge system configuration (e.g., config/dev.yaml)
  Object.assign(config, loadSystemConfig('consciousness'));

  // 3. Merge script-level override (if exists)
  if (scriptConfig.config_override) {
    Object.assign(config, scriptConfig.config_override);
  }

  // 4. Apply runtime adjustments (e.g., adjust batch size based on session load)
  config.performance.batching.batch_size = adjustBatchSizeForLoad(
    config.performance.batching.batch_size
  );

  return config;
}
```

**Template Generation Mechanism**:

System supports two approaches to handle natural language described `detection_focus`:

**Approach 1: Direct Injection Mode (Recommended)**
Inject natural language description directly into base template, preserving original semantics:

```typescript
// Direct injection mode: Inject detection_focus as whole into template
function generateConsciousnessPromptDirect(
  detectionFocus: string,
  outputVars: OutputVar[]
): string {
  // 1. Load base template (contains {{detection_focus}} and {{output_vars}} placeholders)
  const baseTemplate = loadTemplate('templates/consciousness/base-detection.md');

  // 2. Directly replace placeholders, preserving natural language original form
  return baseTemplate
    .replace('{{detection_focus}}', detectionFocus)
    .replace('{{output_vars}}', generateOutputVarsPlaceholder(outputVars));
}
```

**Approach 2: Intelligent Parsing Mode (Advanced)**
Use LLM to parse natural language into structured configuration, then generate prompts:

```typescript
// Intelligent parsing mode: Use LLM to parse natural language
async function generateConsciousnessPromptParsed(
  detectionFocus: string,
  outputVars: OutputVar[]
): string {
  // 1. Use LLM to parse natural language description in detection_focus
  const parsedConfig = await parseDetectionFocus(detectionFocus);

  // 2. Select or generate specific template based on parsed result
  const template = selectTemplateByConfig(parsedConfig);

  // 3. Inject structured configuration parameters
  return injectStructuredConfig(template, parsedConfig, outputVars);
}

// Natural language parsing example
async function parseDetectionFocus(detectionFocus: string): Promise<ParsedConfig> {
  const prompt = `Parse the following consciousness detection description into structured configuration:\n\n${detectionFocus}`;
  const response = await llmCall(prompt);
  return JSON.parse(response);
}
```

**Base Template Example** (templates/consciousness/base-detection.md):

````markdown
# Consciousness Detection Prompt

## Detection Task

{{detection_focus}}

## Output Format

Please output strictly in the following JSON format:

```json
{
{{output_vars}}
}
```
````

```yaml
loading:
  scope: ['phase:assessment', 'phase:intervention']
  activation: 'conditional' # Activate on demand
```

3. **Dynamic Consciousness**: Runtime dynamic loading based on context
   ```yaml
   loading:
     scope: 'dynamic'
     activation: 'on_demand'
     loading_conditions:
       - 'user_mentions_trauma == true'
       - 'session_duration > 15_minutes'
   ```

**Performance Optimization**:

- **Lazy Loading**: Consciousness only instantiated when needed
- **Reference Counting**: Multiple scenarios share same consciousness, avoid duplicate loading
- **Semantic Caching**: Caching based on semantic similarity, not exact match
- **Adaptive Sampling**: Dynamically adjust detection frequency based on dialogue intensity

### 3.4 Safety Baseline Assurance

**Even while adhering to "pure LLM", safety baseline must be guaranteed**:

```yaml
safety_backstop:
  # Minimal keyword matching (not a complete rule engine)
  emergency_keywords:
    - 'suicide'
    - 'self-harm'
    - 'want to die'
    - 'kill myself'

  # Implementation: String contains check, <1ms latency
  implementation: 'string.includes() check'

  # Trigger action: Immediately pause dialogue, invoke crisis intervention
  action: 'immediate_crisis_intervention'

  # Priority: Highest, overrides all other logic
  priority: 'highest'
```

### 3.5 Consciousness Trigger Engine Workflow

```
During Dialogue
    ↓
[Consciousness Loader] ← Load relevant consciousness scripts based on current Phase/context
    │       Only load prompt templates, no complex logic instantiation
    ↓
[Detection Scheduler] ← Intelligent scheduling (not fixed stages)
    │       Considerations:
    │       - Message importance (emotional intensity, length)
    │       - Last detection time
    │       - Cache hit rate
    ↓
[Batch Detector] ← Batch assemble prompts, single LLM call
    │       Input: Multiple messages + multiple consciousness templates
    │       Output: Batch detection results (structured JSON)
    ↓
[Result Parser] ← Parse LLM's structured response
    ├─ Trigger skill invocation → Insert skill Topic
    ├─ Update semantic cache → Improve subsequent detection efficiency
    └─ Adjust detection frequency → Adaptive optimization
```

### 3.6 Performance Optimization Strategies (LLM-native)

**Integration with Minimal Mode**: Performance optimization configuration can be achieved through:

1. **Describe in detection_focus**: Use natural language to describe performance requirements (e.g., "use lightweight model for quick detection, only use deep model when confidence is low")
2. **Configure in performance field**: Use optional structured configuration (e.g., caching, batching, sampling)
3. **System-level default configuration**: For advanced optimization strategies (e.g., model layering, semantic caching), system can provide default implementation

**Not relying on rule engines, but optimizing through LLM-native approaches**:

1. **Model Layering**:

   ```yaml
   detection_tiers:
     tier1: # High-frequency detection
       model: 'claude-3-haiku' # Fast, cheap
       prompt: 'Simplified detection template'
       max_tokens: 200

     tier2: # Deep detection
       model: 'claude-3-sonnet' # More accurate
       trigger: 'tier1.confidence < 0.7'
   ```

2. **Intelligent Sampling**:

   ```yaml
   adaptive_sampling:
     base_rate: 0.2 # 20% message detection

     increase_when:
       - 'emotional_intensity > 0.7'
       - 'message_length > 100_chars'
       - 'contains_question == true'

     decrease_when:
       - 'consecutive_similar_messages > 3'
       - 'session_phase == "closing"'
   ```

3. **Semantic Caching**:
   ```typescript
   class ConsciousnessCache {
     // Semantic-based caching, not exact match
     async getCachedDetection(message: string, context: Context): Promise<DetectionResult | null> {
       // Calculate semantic similarity
       const similarity = await this.calculateSemanticSimilarity(message, cachedMessages);
       if (similarity > 0.9) {
         return cachedResult;
       }
       return null;
     }
   }
   ```

### 3.7 Integration with Existing Architecture

**Fully Reuse Existing Infrastructure**:

1. **Template System**: Reuse `PromptTemplateManager` to load and render prompt templates
2. **LLM Orchestration**: Reuse `LLMOrchestrator` unified LLM call interface
3. **Monitor Pattern**: Similar architecture pattern to `MonitorOrchestrator`
4. **Script Configuration**: Consciousness defined in YAML scripts, consistent with existing Action configuration

**Backward Compatibility**: Existing monitoring system can gradually migrate to consciousness detection architecture, both can coexist.

## 4. Session Layer Implementation Mechanism

### 4.1 Session Guardianship Responsibilities

**Three Guardianship Dimensions**:

1. **Structural Integrity Guardianship**
   - Taking CBT psychological counseling as example
   - Opening phase: Build relationship, set agenda
   - Process phase: Progress through Phases, monitor progress
   - Closing phase: Summarize gains, assign homework

2. **Time Strategy Execution**
   - Phase time allocation monitoring
   - Progress reminders and adjustments
   - Overtime handling mechanism

3. **Main Goal Progress Monitoring**
   - Goal achievement assessment
   - Key milestone checks
   - Risk identification and handling

### 4.2 Decision Boundary Rules

**Session Layer Handles** (affects remaining part of current session):

- Extend or shorten a Phase's time
- Adjust topic order within Phase
- Adjust session pace due to user state changes
- Handle sudden crises within session

**Consultation Layer Handles** (affects overall treatment direction):

- Change ultimate treatment goal of current session
- Adjust arrangement of subsequent sessions
- Reformulate treatment plan based on major discoveries
- Increase or decrease total number of sessions in treatment course

### 4.3 Status Assessment Framework

```yaml
session_assessment:
  # Assessment time points
  assessment_points:
    - '10 minutes after session start'
    - 'At end of each Phase'
    - '15 minutes before session end'

  # Assessment dimensions
  dimensions:
    goal_achievement:
      weight: 0.4
      indicators:
        - 'Core topic coverage'
        - 'Key information collection completeness'
        - 'User cognitive/emotional change'

    process_quality:
      weight: 0.3
      indicators:
        - 'Counseling relationship building quality'
        - 'Dialogue fluency'
        - 'Professional adherence'

    risk_management:
      weight: 0.3
      indicators:
        - 'Safety risk level'
        - 'Ethical risk'
        - 'User satisfaction risk'

  # Decision thresholds
  decision_thresholds:
    replan_session: 0.3 # Consider replanning when goal achievement < 30%
    extend_time: 0.7 # Extend time when progress good but insufficient time
    early_end: 0.9 # Can end early when goal achievement > 90%
```

### 4.4 Replanning Trigger Conditions

```yaml
replanning_triggers:
  crisis_situation:
    condition: 'Detected self-harm, harm to others or other emergency risks'
    action: 'Immediately switch to crisis intervention protocol'
    priority: 'Highest'

  major_discovery:
    condition: 'Discovered more core issue than originally planned'
    action: 'Re-evaluate Session goals'
    priority: 'High'
    escalation: 'Consultation Layer' # Requires cross-layer decision

  strong_resistance:
    condition: 'User resistance consistently high and affecting progress'
    action: 'Adjust counseling approach or pace'
    priority: 'Medium'

  poor_progress:
    condition: 'Goal achievement < 0.3 and time already half passed'
    action: 'Replan remaining time usage'
    priority: 'Medium'
```

## 5. Inter-Layer Coordination Protocol

### 5.1 Status Reporting Specification

**Data Format**:

```typescript
interface LayerReport {
  layer: 'action' | 'topic' | 'phase' | 'session';
  timestamp: string;
  metrics: Record<string, number>;
  decisions: Array<{
    type: string;
    reason: string;
    outcome: string;
  }>;
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    description: string;
    impact: string;
  }>;
}
```

**Reporting Frequency**:

- Action Layer: After each action execution completes
- Topic Layer: After each topic completes or adjusts
- Phase Layer: At end of each Phase
- Session Layer: At key assessment time points

### 5.2 Decision Impact Propagation

```
Action Adjustment → Affects Topic progress assessment
Topic Adjustment → Affects Phase progress monitoring
Phase Adjustment → Affects Session time allocation
Session Adjustment → Affects Consultation treatment plan
```

### 5.3 Conflict Resolution Mechanism

1. **Same-Level Conflict**: Decision conflicts occurring within same layer
   - Solution: Sort by priority, high priority overrides low priority
   - Example: Multiple consciousnesses triggered simultaneously in Phase layer, sorted by urgency

2. **Cross-Layer Conflict**: Decisions from different layers contradict each other
   - Solution: Report to upper layer, coordinated by upper layer
   - Example: Topic layer wants to add actions, but Phase layer wants to reduce due to insufficient time

3. **Resource Conflict**: Multiple adjustments competing for same resource (e.g., time)
   - Solution: Allocate by strategic importance
   - Example: Crisis intervention vs routine topic progression

## 6. Implementation Checklist

### Phase 1: Action Layer (MVP Core)

- [ ] Implement ai_say, ai_ask basic action types
- [ ] Develop main thread + monitor thread framework
- [ ] Establish action execution status tracking
- [ ] Implement basic monitor check items (safety, relevance)

### Phase 2: Topic Layer

- [ ] Implement Topic planner basic version
- [ ] Develop LLM generate actions + schema validation flow
- [ ] Establish adjustment decision recording mechanism
- [ ] Implement status reporting protocol

### Phase 3: Phase Layer

- [ ] Implement emotion recognition and resistance recognition consciousness
- [ ] Develop basic counseling skill library (empathy expression, resistance handling)
- [ ] Establish consciousness trigger to skill invocation flow
- [ ] Implement topic queue adjustment mechanism

### Phase 4: Session Layer

- [ ] Implement session structure integrity check
- [ ] Develop time strategy execution monitoring
- [ ] Establish Session layer decision boundary rules
- [ ] Implement status assessment framework

### Phase 5: Consultation Layer

- [ ] Implement cross-session progress assessment
- [ ] Develop treatment plan adjustment mechanism
- [ ] Establish long-term pattern recognition capability
- [ ] Implement complete inter-layer coordination

## 7. Performance and Monitoring Metrics

### Key Performance Indicators

1. **Response Time**: Decision latency at each layer < 2 seconds
2. **Resource Usage**: Monitor thread CPU usage < 20%
3. **Decision Quality**: Goal achievement improvement after adjustment > 20%
4. **Recognition Accuracy**: Consciousness recognition accuracy > 85%

### Monitoring Dashboard

Recommended monitoring dimensions to implement:

- Decision frequency distribution by layer
- Adjustment success rate statistics
- Consciousness trigger and skill invocation correlation analysis
- Inter-layer communication latency heatmap
- User satisfaction and system adjustment correlation

## 8. Extension and Evolution

### Short-term Extension (3-6 months)

1. Add more Action types (ai_draw, ai_form, etc.)
2. Enrich consciousness reconnaissance types (more psychological counseling dimensions)
3. Expand counseling skill library (more therapy techniques)
4. Optimize LLM prompt engineering

### Mid-term Evolution (6-12 months)

1. Machine learning optimization: Optimize decision thresholds based on historical data
2. Personalization adaptation: Adjust monitoring strategy based on user characteristics
3. Multimodal extension: Support voice, image and other input/output
4. Collaboration mode: AI and human counselor collaboration mechanism

### Long-term Vision (1-2 years)

1. Autonomous learning: Automatically extract patterns and skills from counseling cases
2. Domain extension: Expand to other professional dialogue domains (medical, education, etc.)
3. Ecosystem building: Counseling skill marketplace, third-party skill development
4. Research platform: Psychological counseling research data collection and analysis

---

## Appendix

### A. Related Documents

1. [Decision Document](../decisions/2026-03-09-five-layer-implementation-decisions.md)
2. [Philosophical Thinking](../../domain/strategic/heartrule-consultation-intelligence-implementation-mechanism.md) _(Historical Reference)_
3. MVP Roadmap _(Document not yet migrated)_

### B. Technical References

1. Worker Threads implementation examples
2. LLM prompt template library
3. Schema validation tool configuration
4. Monitoring metrics collection framework

### C. Professional References

1. Psychological counseling ethical standards
2. Cognitive Behavioral Therapy technique manual
3. Crisis intervention protocol standards
4. Counseling effectiveness assessment tools
