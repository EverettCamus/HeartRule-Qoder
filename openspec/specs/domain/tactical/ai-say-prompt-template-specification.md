# ai_say Function Design Specification and Application Scenario Examples

**Date**: 2025-01-14
**Version**: 2.0
**Purpose**: Provide the final design specification, prompt templates, and application scenario examples for ai_say, for direct use by CBT engineers and developers.

---

## 📋 Table of Contents

1. [Architecture Design Philosophy](#architecture-design-philosophy)
2. [Prompt Template Definition](#prompt-template-definition)
   - Mainline A: Execution Layer (Business Logic + Response Generation)
   - Branch B: Analysis Layer (Deep Assessment + Strategy Planning)
   - Branch C: Monitor Layer (Risk Monitoring + Intervention)
3. [ai_say Script Field Design Instructions (For CBT Engineers)](#ai_say-script-field-design-instructions-for-cbt-engineers)
4. [Application Scenario 1: Introducing the ABC Model](#application-scenario-1-introducing-the-abc-model)
5. [Application Scenario 2: Persuading User to Try Thought Record](#application-scenario-2-persuading-user-to-try-thought-record)

---

## 🏗️ Architecture Design Philosophy

### Three-Layer Architecture: Clear Separation of Responsibilities

```
┌─────────────────────────────────────────────────────────┐
│  Script Layer (Domain Layer)                            │
│  - Define business logic (explanation topics, persuasion strategies, etc.)                  │
│  - Define assessment dimensions, exit conditions, and step adjustment rules                  │
│  - Define user profile (used by Branch B)               │
└─────────────────────────────────────────────────────────┘
           ↓ Configuration
┌─────────────────────────────────────────────────────────┐
│  Branch B (Analysis Layer)                              │
│  - Deep analysis of conversation history                │
│  - Execute script-defined assessment dimensions         │
│  - Phase 0: Generate base_steps + strategy_steps        │
│          + strategy_prompt before topic round 1 (step generation and strategy initialization)        │
│  - Phase 1+: Update assessment results, progress_summary,     │
│            strategy_steps (including planned_steps) and step adjustment   │
│            recommendations (step_adjustment_recommendation)        │
│  - Output structured assessment results and communication strategies (for Mainline A and rule engine use)│
│  Execution frequency: Round 1 sync preprocessing, then every 2-3 rounds, 5-10 second response      │
└─────────────────────────────────────────────────────────┘
           ↓ Assessment Results + Strategy + Steps
┌─────────────────────────────────────────────────────────┐
│  Mainline A (Execution Layer)                           │
│  - Execute business logic (explanation/persuasion, etc.)│
│  - Apply communication strategies and steps (from Branch B)                       │
│  - Generate response                                    │
│  - Output exit recommendation (exit + exit_reason), actual exit by rule engine│
│    makes final decision based on structured assessment results and exit rules               │
│  Execution frequency: Every round, 2-3 second response │
└─────────────────────────────────────────────────────────┘
           ↓ Response + Exit Decision
┌─────────────────────────────────────────────────────────┐
│  Rule Engine (Framework Layer)                          │
│  - Read script-defined exit rules and step adjustment rules                  │
│  - Make deterministic judgments based on Branch B assessment results and Mainline A output (millisecond level)    │
│  - In edge cases not covered by rules, can reference Mainline A's LLM exit judgment  │
│    as a fallback signal                                 │
└─────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Single Responsibility Principle (SRP)**:
   - Mainline A: Focus on business logic and response generation, primary risk identification
   - Branch B: Focus on deep analysis and strategy planning, implement end-to-end strategy generation
   - Branch C: Focus on safety review and revision

2. **Attention Focus**:
   - Mainline A is more focused on the current explanation/persuasion task
   - Mainline A no longer handles deep analysis (handled by Branch B)
   - User profile, long-term summary, and other remote information are only used in Branch B

3. **Deterministic First**:
   - Exit decisions are made by the rule engine based on script `exit_criteria` and Branch B structured assessment results (deterministic, auditable)
   - Mainline A's LLM exit judgment serves only as a fallback signal or consistency check (flexible, supplementary)
   - Abort condition evaluation has higher priority than exit condition judgment, ensuring timely abort of current interaction in emergency situations

4. **Observability First**:
   - All decision processes should leave traces, including strategy generation, exit judgment, risk assessment, etc.
   - Provide visualization support for decision basis, facilitating debugging and optimization
   - Record prompt version and LLM performance metrics, supporting continuous improvement

---

## 📝 Prompt Template Definition

### Mainline A: Execution Layer (Business Logic + Response Generation)

#### Design Philosophy

**Responsibility Boundary (What)**:

- ✅ **Execute business logic and generate response**: Generate natural language response for this round based on script-defined [Explanation Topic] and current step status.
- ✅ **Implement current communication strategy and step plan**: Apply current step's goal and communication focus in the response based on `strategy_prompt` and `strategy_steps` provided by Branch B.
- ✅ **Provide exit and risk screening recommendations for this round**: Combine Branch B's `assessment_summary` and inline exit conditions in the template, output `exit` / `exit_reason` for this round, and perform quick screening for emergency risks, filling the `risk_screening` field.

**Implementation Method / Input Method (How)**:

- Use synchronous LLM calls to execute Mainline A prompt template in each conversation round.
- Main inputs include: script layer provided `{%topic_description%}`, Branch B outputs `{%progress_summary%}`, `{%strategy_steps%}` (step count and description), `{%strategy_prompt%}`, recent dialogue window `{%chat_with_latest_message%}`, and `{%assessment_summary%}`, etc.
- The prompt explicitly requires the model through "[Your Task]" to sequentially complete: execute business logic, determine whether to exit, perform quick emergency risk screening and return structured JSON.

**Architecture Constraints / Data Boundary (Boundary)**:

- ❌ Does not handle deep assessment responsibilities (quantitative assessment of understanding level, emotion, resistance, etc. dimensions is completed by Branch B).
- ❌ Does not directly access user profile and long-term summary, only uses user profile information indirectly through `strategy_prompt`, `progress_summary`, etc. provided by Branch B.
- ✅ Boundary with script layer: Only consumes business semantics and exit rules defined by the script (such as `topic_description`, `subtype`, `exit_criteria`), does not modify script content.
- ✅ Boundary with Branch B: Uses Branch B's output assessment summary and strategy as input signals, does not write back to Branch B state.
- ✅ Boundary with rule engine: Rule engine makes final exit decision based on Mainline A's `exit` / `exit_reason` and Branch B's structured assessment results.
- ✅ Boundary with Branch C: Exposes this round's quick risk screening results to Branch C and rule engine through `risk_screening` field, the latter decides whether to initiate deeper safety assessment and script switching.

**Performance Characteristics**:

- Prompt size: ~300 tokens (compact, stable)
- Typically 2-3 second response
- Task count: 2 (execute business logic + determine whether to exit)
- Context scope: Only uses recent dialogue window + current step status + strategy prompt (does not read complete history)

---

**Execution Frequency**: Synchronous, every round (2-3 second response)

**Template File**: `config/prompts/ai-say-mainline-a.prompt`

**Template Content**:

```
Current time {%time%}, you are {%who%}. Please continue the conversation and generate a response for {%user%}.

[Explanation Topic]
# Note: This can contain complex business logic, written by CBT engineers
# For example: detailed explanation steps, persuasion strategies, guidance techniques, etc.
# CBT engineers can also define topic-specific risk concerns here (e.g., common triggers, misunderstanding types, high-risk emotions easily triggered)
# This is Mainline A's core focus
{%topic_description%}

[Current Explanation Progress]
{%progress_summary%}
# ← Generated by Branch B

[Current Strategy Step]
You are executing step {%step_index%}/{%total_steps%}: {%step_description%}
Next step focus: {%next_step_focus%}
# ← Planned and dynamically adjusted by Branch B

[Communication Strategy]
# Note: This strategy is generated by Branch B based on user profile, already containing the essence of user characteristics
{%strategy_prompt%}

[Recent Dialogue Window]
# Only contains the most recent rounds, respond directly to the last user message
{%chat_with_latest_message%}
# Note: This is the most recent dialogue segment of this session, the latest message is merged at the end
# Using a short window can reduce interference and cost while preserving current context

[Your Task]

1. **Execute Business Logic**:
   - Generate your response according to the requirements of [Explanation Topic]
   - Apply the guidance in [Communication Strategy]
   - Ensure the response aligns with the focus of the current strategy step

2. **Determine Whether to Exit**:
   - Client response assessment:
     {%assessment_summary%}
     # For example:
     # - Understanding level: 85 points
     # - Has questions: No
     # - Expressed understanding: Yes
     # - Emotional state: Positive
     # - Resistance level: 0 points

   - Exit conditions:
     # Centered on understanding level/questions/expressed understanding, etc., this template directly specifies
     Understanding level >= 80 and no questions, or Understanding level >= 70 and expressed understanding

   - Please determine whether to exit the current topic

   > **Collaboration Process Note**: When Branch B assessment recommends preparing to exit (`should_exit=true`), the rule layer will add exit prompt to Mainline A, causing the conversation to gradually enter the closing phase. Only when Mainline A actually marks `exit=true` will the rule layer make the final exit decision.

3. **Quick Risk Screening**:
  # Purpose: Quickly identify emergency risks that need immediate attention, used to decide whether to synchronously trigger Branch C
  - Based on the most recent user reply and conversation history, determine if the following risks exist:
    - Suicide/self-harm risk
    - Crisis emotion (extremely high emotional intensity, near loss of control)
    - Severe cognitive distortion (catastrophizing, absolutist thinking with significant impact)
    - Therapeutic alliance rupture risk (strong accusation, obvious distrust)
  - Please truthfully fill in the screening results in the output risk_screening field (urgent_risk_detected and risk_type)

[Output Format]
Strictly output in the following JSON format:
{
  "response": {
    "Counselor": "Your response content..."
  },
  "exit": true|false,
  "exit_reason": "Exit reason or continue reason...",
  "risk_screening": {
    "urgent_risk_detected": true|false,
    "risk_type": "suicide|self_harm|crisis_emotion|severe_distortion|alliance_rupture|null"
  }
}
```

**Variable Description**:

- `{%time%}` - Current time
- `{%who%}` - AI role name (e.g., "Dr. Li")
- `{%user%}` - User name (e.g., "Xiao Ming")
- `{%topic_description%}` - Detailed description of the explanation topic (script-defined, can contain complex business logic)
- `{%progress_summary%}` - Explanation progress summary (generated by Branch B: round 1 from phase 0, subsequent rounds from phase 1+ latest output)
- `{%step_index%}`, `{%total_steps%}`, `{%step_description%}`, `{%next_step_focus%}` - Strategy step cursor (generated by Branch B: round 1 from phase 0's `strategy_steps`, round 2+ from phase 1+ updated `strategy_steps`)
- `{%strategy_prompt%}` - Communication strategy prompt (generated by Branch B: round 1 from phase 0, round 2+ from phase 1+ latest output)
- `{%chat_with_latest_message%}` - Most recent rounds of this session (the last one is the user's latest message)
- `{%assessment_summary%}` - `assessment_summary` field in Branch B output (assessment result summary for Mainline A to use, for exit judgment)

---

### Natural Transition: Automatic Grading Based on phase/topic/action

> ⚠️ This section only explains **how the engine automatically decides "how formal" the transition should be after Mainline A exits**. CBT engineers **do not need** to configure any `transition_mode` field in the script, only need to maintain the session structure (phase → topic → action).

#### Design Philosophy (Who Decides the Transition Form?)

- **Script Layer**: Only defines session structure and content:
  - phase: Major stages (e.g., "Building Alliance", "Introducing ABC Model", "Assigning Homework")
  - topic: Specific small topics within a phase
  - action: `ai_say` / `ai_ask` / `ai_think` within a topic
- **Engine Layer**: After `ai_say` topic exits (EV-064.shouldExit === true), based on
  current node → next node's structural relationship, automatically derives **transitionLevel**:
  - `phase`: Cross-phase → Use "**Explicit Transition**" template
  - `topic`: Same phase, different topic → Use "**Lightweight Transition**" template
  - `action`: Action switch within same topic → **No additional transition statement generated**

#### Three Transition Level Effect Examples

1. **Phase Level (Explicit Transition)**
   - Typical scenario:
     - Exiting from the last `ai_say` of "Introducing ABC Model", entering new phase "Assigning Thought Record Homework".
   - Effect example:

   ```
   In this part, we mainly looked at the ABC model together: how the event itself, your thoughts about it, and the resulting emotions influence each other.
   Next, I'd like to do something concrete with you - try a small exercise to apply the ABC model to a recent annoyance of yours,
   so you can more intuitively see: "So my momentary thought can affect my feelings so much."
   ```

   - Characteristics:
     - 2-3 sentences, clearly marking "the previous major section is finished, entering a new stage";
     - Template: **PhaseTransitionTemplate** (defined in detail documentation).

2. **Topic Level (Lightweight Transition)**
   - Typical scenario:
     - Within the same phase, switching from "Explaining ABC with Images" to "Giving a Life Example".
   - Effect example:

   ```
   Speaking of which, let's try a more life-like example.
   For instance, imagine your most recent particularly nervous moment, and we can apply the ABC model we just discussed to that situation.
   ```

   - Characteristics:
     - 0-2 sentences, very short "casual mention" style transition;
     - If recent dialogue has already naturally paved the way, there may be almost no obvious "let's switch topics" sentence structure;
     - Template: **TopicTransitionTemplate** (defined in detail documentation).

3. **Action Level (No Explicit Transition)**
   - Typical scenario:
     - Two consecutive `ai_say` within the same topic;
     - Or after `ai_say` exits, immediately entering `ai_ask` questioning within the same topic.
   - Effect strategy:
     - Engine will not insert an extra "transition phrase", directly enters the next action;
     - Coherence is ensured by:
       - Mainline A template's `recent_chat_window` / `chat_with_latest_message`,
       - Branch B's `strategy_prompt` and `progress_summary`.

#### Impact on CBT Engineers

- You **don't need** to remember any `transition_mode` enums, and **don't need** to handwrite "transition sentences" in YAML;
- What you need to do is:
  - Break down the session script into reasonable phase / topic / action structure;
  - Write good `topic` / `topic_summary` / `benefit` for each action (especially topic-starting actions);
- The rest:
  - **"When to exit current topic"** → Decided by `exit_criteria` + Branch B assessment + rule engine;
  - **"How formal the transition is after exit"** → Automatically determined by engine based on phase/topic/action hierarchy;
  - **"How to phrase the specific transition"** → Naturally generated by Phase/Topic level transition templates + LLM.

### Branch B: Analysis Layer (Deep Assessment + Strategy Planning)

#### Design Philosophy

**Responsibility Boundary (What)**:

1. **Quantitatively assess session state and output structured results**
   - Quantitatively assess current session state according to assessment dimensions agreed in script and template (such as understanding level, emotional state, resistance level, etc.);
   - Output assessment results in structured data form (such as `assessment`, `assessment_summary`), for use by rule engine, Mainline A, and other components.

2. **Plan and maintain step plan for current topic**
   - At topic start, generate baseline step plan (`base_steps`) for current `ai_say` topic;
   - In subsequent rounds, update step execution status (`strategy_steps`) based on latest assessment results, and output step adjustment recommendations (`step_adjustment_recommendation`), which are deterministically applied by the rule engine combined with `step_adjustment_rules` in the script.

3. **Generate communication strategy based on assessment results and user profile**
   - Synthesize current structured assessment results and user profile information to generate or update communication strategy prompts for Mainline A (such as `strategy_prompt`, `progress_summary`);
   - Strategy already embeds key profile information; Mainline A only needs to use strategy and step variables, without directly accessing user profile.

**Implementation Method / Input Method (How)**:

- Use layered conversation context (recent dialogue window `recent_chat_window` + current session summary `current_session_summary` + cross-session long-term summary `long_term_summary`) as input to perform deep semantic analysis of the session process, providing context support for assessment and strategy.
- Works under **two-phase execution mechanism**:
  - Phase 0: Before topic starts for the first time, synchronously generate `base_steps`, initial `strategy_steps` and initial `strategy_prompt`; Mainline A round 1 must wait for this phase to complete;
  - Phase 1+: In subsequent rounds, asynchronously update assessment results, progress summary, step status and communication strategy; Mainline A uses the most recent available output.

**Architecture Constraints / Data Boundary (Boundary)**:

- User profile (education background, learning style, cognitive characteristics, emotional characteristics, language preference, etc.) and long-term session summary are only directly accessed and processed in Branch B; other components only indirectly use this information through summaries and strategies output by Branch B such as `strategy_prompt`, `progress_summary`.
- Does not directly participate in deterministic calculation of exit decisions, but outputs structured assessment results and step adjustment recommendations, with final decisions made by the rule engine based on script-defined `exit_criteria` and `step_adjustment_rules`.
- Boundary with Mainline A: Mainline A only reads Branch B's output (assessment summary, strategy, step status), does not write back or modify Branch B's internal state.
- Boundary with script layer: Branch B reads script-defined assessment dimensions and exit-related field interpretations, but does not modify script content or rules themselves.

**Performance Characteristics**:

- Can be slow (5-10 second response), in exchange for higher quality assessment and strategy;
- Executes every 2-3 rounds (round 1 is sync preprocessing, subsequent rounds usually async), does not block Mainline A's round-by-round responses.

#### Two-Phase Execution Mechanism

- **Phase 0 (Round 1 Sync Preprocessing: Step Generation and Strategy Initialization)**
  - Trigger timing: A certain ai_say topic starts executing for the first time, and needs Branch B support.
  - Input:
    - Script variable substitution completed `{%topic_description%}` (containing [Explanation Points] / [Persuasion Points], etc.)
    - `ai_say_subtype` / `ai_say_subtype_hint`
    - User profile (education background, learning style, cognitive characteristics, emotional characteristics, language preference, etc.)
    - Current conversation context (first round usually only has user's latest message)
  - Output:
    - `base_steps`: **Baseline step plan** for this topic (string array, immutable)
    - `strategy_steps`: Initialized step execution status (containing `planned_steps`, `current_step_index`, `step_description`, `next_step_focus`)
    - `strategy_prompt`: Initial communication strategy for Mainline A
    - `initialization_reasoning`: Brief explanation of step breakdown and strategy selection
  - Execution order: Mainline A round 1 **must wait** for Phase 0 to complete, then use the step and strategy variables to generate this round's response.

- **Phase 1+ (Round 2 and after: Async Monitoring and Adjustment)**
  - Trigger timing: Round 2 and after of the same ai_say topic.
  - Input:
    - `base_steps` (baseline steps generated in Phase 0, for reference only, not modifiable)
    - Previous round's `strategy_steps` (injected as `last_strategy_steps` into prompt)
    - Layered conversation context, user profile, previous round Mainline A output, etc.
  - Output:
    - `assessment` / `assessment_summary`: Latest round's assessment results
    - `progress_summary`: Current progress summary
    - `strategy_steps`: Updated step execution status (containing `planned_steps`)
    - `current_step_completion`: Current step completion level
    - `step_adjustment_recommendation`: Whether step plan needs adjustment and how to adjust
    - `strategy_prompt`: Updated communication strategy for Mainline A
  - Execution method: Usually runs as **async task**, Mainline A from round 2 no longer waits for Branch B, synchronously uses "most recent available" Branch B output results.

**Layered Memory Design (Generation and Management)**:

- `recent_chat_window`: Before each call, the system trims the most recent N rounds of dialogue from current session records (or at most M tokens), mainly used to maintain language and context coherence.
- `current_session_summary`: At the end of this session (or at the end of each topic), a dedicated summary model generates based on this session's dialogue and topic information, session-level summary, stored in session records.
- `long_term_summary`: After each session ends, use old `long_term_summary` + new `current_session_summary` to call summary model for rolling update, forming cross-session long-term summary, stored in user long-term profile.
- Usage principle: For language coherence, prioritize `recent_chat_window`; for understanding this session's progress, look at `current_session_summary`; for understanding long-term patterns and risk trends, look at `long_term_summary`.

---

**Template Content (Phase 0: Step Generation and Strategy Initialization, General)**:

- **Call timing**: When a certain ai_say topic starts executing for the first time and needs Branch B support, the orchestrator calls this template before calling Mainline A.
- **Execution goal**:
  - Extract/summarize a set of structured baseline steps `base_steps[]` from `{%topic_description%}`;
  - Initialize executable `strategy_steps` (containing `planned_steps` and current step cursor);
  - Generate initial `strategy_prompt` for Mainline A, combining user profile for personalized language style and strategy.

**Prompt Template**:

```markdown
[Branch B Phase 0: Step Generation and Strategy Initialization (General)]

You are a senior CBT instructional design and session strategy expert, responsible for generating a clear and executable step plan and communication strategy before a certain ai_say topic starts, based on the script-provided explanation/persuasion content and user profile.

[Script-Provided Explanation/Persuasion Content (Variable Substitution Completed)]
{%topic_description%}

[Current ai_say Scenario Type]

# This template applies to all subtypes, will do light adaptation based on subtype hint

- subtype: {%ai_say_subtype%}
- subtype_hint: {%ai_say_subtype_hint%}

[User Profile]

- Education background: {%education_background%}
- Psychology knowledge: {%psychology_knowledge%}
- Learning style: {%learning_style%}
- Cognitive characteristics: {%cognitive_characteristics%}
- Emotional characteristics: {%emotional_characteristics%}
- Vocabulary level: {%vocabulary_level%}
- Language style: {%language_style%}
- Common expressions: {%user_common_expressions%}

[Current Conversation Context]

# First round usually only has user's latest message, used to judge state when entering topic

{%recent_chat_window%}

[Your Task]

**Task 1: Extract Topic Goal and Core Path**

1. Extract the core goal of this ai_say topic from [Script-Provided Explanation/Persuasion Content] (1-2 sentences).
2. Based on subtype_hint, determine whether it leans toward "explanation" (introduce_concept) or "persuasion/invite trial" (persuade), etc.

**Task 2: Break Down into Baseline Steps base_steps** 3. Break down the entire topic into 3-7 clearly sequenced steps (string array), output as base_steps:

- Each step should be concise and actionable;
- Maintain logical progression between steps;
- For introduce_concept, typically includes: overall introduction → example illustration → guide application;
- For persuade, typically includes: reduce resistance → demonstrate value → invite trial → arrange first step action.

**Task 3: Initialize Strategy Steps strategy_steps** 4. On the basis of base_steps, initialize executable strategy_steps:

- planned_steps: Use base_steps, can do slight splitting or merging if necessary;
- current_step_index: 1 (start from step 1);
- total_steps: length of planned_steps;
- step_description: Brief description of step 1;
- next_step_focus: Focus of step 2 (if exists).

**Task 4: Generate Initial Communication Strategy strategy_prompt** 5. Combine user profile and subtype_hint to generate a communication strategy prompt for Mainline A (strategy_prompt):

- Include language style suggestions (formal/colloquial, pace, word difficulty, etc.);
- Example selection strategy (whether to use life-like examples, situations related to user experience, etc.);
- Rapport building method (how to validate user, how to reduce defensiveness, etc.);
- Guidance and closing strategy (how to invite questions, how to confirm understanding/acceptance, etc.).

**Task 5: Provide Initialization Reasoning (initialization_reasoning)** 6. Use 2-4 sentences of natural language to explain why you broke down steps this way and why you set the initial strategy this way.

[Output Format]

Strictly output in the following JSON format (field order can be adjusted, but all must be included):

{
"base_steps": [
"Step 1: ...",
"Step 2: ...",
"Step 3: ..."
],
"strategy_steps": {
"planned_steps": [
"Step 1: ...",
"Step 2: ...",
"Step 3: ..."
],
"current_step_index": 1,
"total_steps": 3,
"step_description": "Current step description (usually step 1)",
"next_step_focus": "Next step focus (usually step 2)"
},
"strategy_prompt": "[Communication Strategy] ... Initial strategy suggestions for Mainline A ...",
"initialization_reasoning": "Brief explanation of why steps were broken down this way and strategy was set this way"
}
```

> In actual implementation, `assessment` / `assessment_summary` / `progress_summary` / `current_step_completion` fields can be added on this basis to obtain initial assessment results in round 1; the "Branch B Output (Initialization)" in subsequent examples in this document adopts this extended form.

### Three Prompt Template Examples for Different subtypes

In the CBT domain, the `subtype` set of ai_say is a relatively limited group (such as `introduce_concept` / `persuade` / `train_intro`, etc.). At the current stage, this design adopts a simple and direct implementation convention:

- Each subtype corresponds to a set of **three prompt templates**:
  - Mainline A: Execution layer template (responsible for this round's response + exit judgment);
  - Branch B: Analysis layer template (responsible for deep assessment + strategy planning);
  - Branch C: Monitor layer template (responsible for risk monitoring + intervention suggestions).
- The three templates for different subtypes can differ in structure: task breakdown, assessment dimensions, output JSON fields can all be adjusted as needed.

#### Example 1: subtype = `introduce_concept` (Knowledge Explanation)

- **Mainline A Template**: The template in "Mainline A: Execution Layer (Business Logic + Response Generation)" above, exit judgment depends on:
  - Branch B output's `understanding_level` / `has_questions` / `expressed_understanding` fields;
  - Exit conditions agreed inline in the template (e.g., understanding level >= 80 and no questions, or understanding level >= 70 and expressed understanding).
- **Branch B Template (Phase 0 + Phase 1+)**: The general template in "Branch B: Analysis Layer (Deep Assessment + Strategy Planning)" above,
  - **Phase 0 (Round 1 Sync Preprocessing)**:
    - Input: Variable substitution completed `{%topic_description%}`, `ai_say_subtype` / `ai_say_subtype_hint`, user profile, current conversation context;
    - Output: `base_steps` (baseline steps), `strategy_steps` (containing `planned_steps`, `current_step_index`, `total_steps`, `step_description`, `next_step_focus`), `strategy_prompt`, `initialization_reasoning`;
    - Mainline A round 1 **must wait** for this phase to complete before calling, and use the step and strategy variables to generate round 1 response.
  - **Phase 1+ (Round 2 and after async monitoring and adjustment)**:
    - Input: `base_steps`, previous round `strategy_steps` (injected as `{%last_strategy_steps%}`), layered conversation context, user profile, previous round Mainline A output;
    - Output: Updated `assessment` / `assessment_summary`, `progress_summary`, `strategy_steps` (containing `planned_steps`), `current_step_completion`, `step_adjustment_recommendation`, `strategy_prompt`;
    - Usually runs asynchronously, Mainline A from round 2 uses "most recent available" Branch B output results.
- **Branch C Template**: The template in "Branch C: Monitor Layer (Risk Monitoring + Intervention)" above, as one of the basic risk monitoring templates shared by all subtypes.

#### Example 2: subtype = `persuade` (Persuasion / Invite Trial)

This scenario goal: While ensuring safety and respecting autonomy, **invite user to try a certain technique/homework or accept a certain arrangement**, and determine whether to end the current persuasion phase based on user acceptance, resistance level, and willingness to try.

##### Mainline A Prompt Template (persuade)

```markdown
Current time {%time%}, you are {%who%}. Currently you are conversing with {%user%} around a certain invitation/persuasion task, please continue the conversation and generate this round's response.

[Explanation/Persuasion Topic]

# Note: This can contain specific persuasion goals and key arguments, written by CBT engineers in the script

# For example: why try a certain thought record, exercise, exposure homework, etc.

# And persuasion strategy points suitable for this user (can reference Branch B's strategy)

{%topic_description%}

[Current Persuasion Progress]
{%progress_summary%}

# ← Generated by Branch B, summary of current persuasion phase progress

[Current Strategy Step]
You are executing step {%step_index%}/{%total_steps%}: {%step_description%}
Next step focus: {%next_step_focus%}

# ← Planned and dynamically adjusted by Branch B

[Communication Strategy]

# Note: This strategy is generated by Branch B based on user profile, already containing the essence of user characteristics

# Mainline A doesn't need to look at original user profile, just apply this strategy

{%strategy_prompt%}

[Recent Dialogue Window] (Only contains the most recent rounds, respond directly to the last user message)
{%chat_with_latest_message%}

# Note: This is the most recent dialogue segment of this session, the latest message is merged at the end

# Using a short window can reduce interference and cost while preserving current context

[Your Task]

1. **Execute Persuasion/Invitation Task**:
   - Generate your response based on the persuasion goals and points in [Explanation/Persuasion Topic]
   - Apply the guidance in [Communication Strategy], pay attention to tone, empathy, and pace
   - Ensure the response focuses on the current strategy step's goal

2. **Determine Whether to Exit Current Persuasion Phase**:
   - Client response assessment:
     {%assessment_summary%}

     # For example:

     # - Acceptance level: 78 points

     # - Resistance level: 2 points

     # - Expressed willingness to try: Yes

     # - Still has major concerns: No

   - Exit conditions (centered on acceptance/resistance/willingness to try/major concerns, etc.):
     Acceptance level >= 70 AND expressed_willingness=true AND has_major_concerns=false

   - Please determine whether to end the current persuasion/invite trial phase, and fill in exit and exit_reason in JSON.

3. **Quick Risk Screening**:

# Purpose: Quickly identify emergency risks that need immediate attention, used to decide whether to synchronously trigger Branch C

- Based on the most recent user reply and conversation history, determine if the following risks exist:
  - Suicide/self-harm risk
  - Crisis emotion (extremely high emotional intensity, near loss of control)
  - Severe cognitive distortion (catastrophizing, absolutist thinking with significant impact)
  - Therapeutic alliance rupture risk (strong accusation, obvious distrust)
- Please truthfully fill in the screening results in the output risk_screening field (urgent_risk_detected and risk_type)

[Output Format]
Strictly output in the following JSON format:
{
"response": {
"Counselor": "Your response content..."
},
"exit": true|false,
"exit_reason": "Exit reason or continue reason...",
"risk_screening": {
"urgent_risk_detected": true|false,
"risk_type": "suicide|self_harm|crisis_emotion|severe_distortion|alliance_rupture|null"
}
}
```

##### Branch B Prompt Template (persuade)

```markdown
[Branch B: Deep Analysis and Strategy Planning (persuade scenario)]

You are a senior CBT counseling supervisor, responsible for deeply analyzing the conversation process in "persuasion/invite trial" scenarios, providing optimization strategies for the next round of conversation, and assessing persuasion phase progress.

[Conversation Context (Layered Memory)]

- Recent N rounds of dialogue:
  @@@
  {%recent_chat_window%}
  @@@
- Current session topic summaries:
  @@@
  {%current_session_summary%}
  @@@
- Cross-session long-term summary:
  @@@
  {%long_term_summary%}
  @@@

# Only provided: most recent rounds of this session + this session summary + cross-session long-term summary, not complete original history

[Current Persuasion Topic]
{%topic%}

[Topic Prompt]
{%topic_prompt%}

[Current ai_say Scenario Type]

# This template is only used when subtype=persuade

{%ai_say_subtype%}

[Scenario Description (For this branch to use)]

# Natural language description mapped from subtype, helping you know the main task focus of the current round:

# - persuade: Focus on persuasion/invite trial, assess acceptance, resistance, willingness to try, etc.

{%ai_say_subtype_hint%}

[Previous Round Mainline A Output]
{%last_mainline_output%}

[User Profile]

# User profile is only used in Branch B, Mainline A uses it indirectly through strategy

**Basic Information**:

- Education background: {%education_background%}
- Psychology knowledge: {%psychology_knowledge%}
- Learning style: {%learning_style%}
- Cognitive characteristics: {%cognitive_characteristics%}
- Emotional characteristics: {%emotional_characteristics%}

**Language Preferences**:

- Vocabulary level: {%vocabulary_level%}
- Language style: {%language_style%}
- Common expressions: {%user_common_expressions%}

[Current Step Plan (From Phase 0 and Previous Round)]

- Baseline steps (base_steps):
  @@@
  {%base_steps%}
  @@@
- Previous round strategy steps (last_strategy_steps):
  @@@
  {%last_strategy_steps%}
  @@@

[Your Task]

**Task 1: Assess Acceptance and Resistance Level**

1. Assess user's overall acceptance of current suggestion/homework (0-100), output: acceptance_level
2. Assess user's resistance level (0-10), output: resistance_score

**Task 2: Assess Willingness to Try and Major Concerns** 3. Determine if user explicitly expressed "willing to try" or equivalent expression, output: expressed_willingness (true|false) 4. Determine if there are still unaddressed major concerns (e.g., safety worries, time/energy, value conflicts, etc.), output: has_major_concerns (true|false) 5. If yes, summarize 1-3 most critical concerns, output: major_concerns (array, elements are natural language short sentences)

**Task 3: Persuasion Progress Summary and Step Adjustment Judgment (Phase 1+)** 6. Summarize current persuasion phase progress (where user has accepted, what key points are still uncovered), output: progress_summary 7. Combine `base_steps` and `{%last_strategy_steps%}` to determine if current execution plan needs adjustment (e.g., simplify steps, add groundwork, reorder), output: step_adjustment_recommendation:

- should_adjust: true|false
- adjustment_type: "simplify" | "elaborate" | "reorder" | "skip" | "insert" | "none"
- reasoning: Natural language explanation

8. Based on the above judgment, output updated strategy_steps:
   - planned_steps: Complete step list (if adjusted, reflect adjusted order and content)
   - current_step_index: Current step number to execute
   - total_steps: Total planned steps (length of planned_steps)
   - step_description: Current step description
   - next_step_focus: Next step focus

**Task 4: Communication Strategy Generation** 9. Based on user profile, above assessment results, and updated strategy_steps, generate communication strategy for next round of persuasion/invitation dialogue, output: strategy_prompt

- Include:
  - Language style suggestions
  - Example selection strategy
  - Rapport building method
  - Guidance/closing strategy

[Output Format]
Strictly output in the following JSON format:
{
"assessment": {
"acceptance_level": 0-100,
"resistance_score": 0-10,
"expressed_willingness": true|false,
"has_major_concerns": true|false,
"major_concerns": ["Concern 1", "Concern 2"],
"reasoning": "Comprehensive assessment reasoning..."
},
"assessment_summary": [
"Acceptance level: 78 points",
"Resistance level: 2 points",
"Expressed willingness to try: Yes",
"Still has major concerns: No"
],
"progress_summary": "Current persuasion phase progress summary...",
"strategy_steps": {
"planned_steps": [
"Step 1: ...",
"Step 2: ...",
"Step 3: ..."
],
"current_step_index": 1,
"total_steps": 3,
"step_description": "Current step description",
"next_step_focus": "Next step focus"
},
"step_adjustment_recommendation": {
"should_adjust": false,
"adjustment_type": "none",
"reasoning": "Current step plan is reasonable, can proceed as planned"
},
"strategy_prompt": "[Communication Strategy] ... Specific suggestions for persuasion/invitation scenario ..."
}
```

##### Branch C Prompt Template (persuade)

- In `persuade` scenario, Branch C uses the complete template in "Branch C: Monitor Layer (Risk Monitoring + Intervention)" above;
- The `risk_signals` / `risk_level` / `risk_assessment` / `intervention_recommendation` output by this template will be used comprehensively by the rule engine and Mainline A's risk screening logic:
  - When `risk_level` is medium/high, the rule engine can require Mainline A to prioritize safety and stabilization in the response;
  - Mainline A reflects "whether to immediately trigger the intervention action recommended by Branch C" in this round's `risk_screening` field.

#### subtype Auto-Completion Mechanism (Script Validation Phase)

From the script author's perspective:

- `subtype` is an optional field;
- If written, it means the script author **explicitly specified a special scenario** (can be used for debugging or specific needs), the system executes according to the explicit value;
- If not written, the system will auto-complete an appropriate subtype for each `ai_say` through an LLM preprocessing before `CounselingScript` aggregate root validation.

Recommended process (simplified version):

1. After script loading, the application layer calls an LLM-backed "script semantic analysis service", passing each `ai_say`'s `topic` / `concept` / `description` to the model.
2. LLM returns:
   - Recommended `subtype` (e.g., introduce_concept / persuade / train_intro / ...)
   - Brief reason (why this judgment)
   - Confidence (0-1)
3. If and only if:
   - This `ai_say` **does not** have an explicit subtype;
   - And confidence ≥ preset threshold (e.g., 0.7),
     Only then use the LLM recommended value to fill subtype; otherwise keep it empty and handle with default/conservative strategy.
4. `CounselingScript` aggregate root during validation requires each `ai_say` needing Branch B support to ultimately have a subtype (explicit or auto-completed).

Design principles:

- Explicit subtype always takes precedence over auto-inference (script author intent first).
- Auto-completion happens at script loading/validation stage, not repeated at each conversation round, controlling latency and cost.
- Inference results and reasons can be recorded for CBT engineers to check and adjust in the tool interface.
- Through end-to-end strategy generation mechanism, ensure auto-inferred subtype can remain consistent with subsequent strategy planning and execution.

#### Script Semantic Analysis Service LLM Prompt Example

> This service is called during script loading / validation phase to **automatically infer each ai_say's subtype**.
> Below is a prompt example that can directly substitute `{topic_description}` and output JSON-parseable results.

- **Call timing**: Application layer calls once for each `ai_say` after loading `CounselingScript`
- **Input content**:
  - `topic`: Topic title (brief)
  - `concept`: Optional, core concept tag
  - `description`: Detailed `topic_description` (business semantics written by script author)
- **Output requirement**: Must be a **single JSON object**, easy for program parsing

**Prompt Template Example** (pseudocode):

```
### Branch C: Safety Review and Revision Engine (Conditionally Triggered, Started When Mainline A Detects High Risk)

#### Design Philosophy

**Responsibility Boundary (What)**:
1. **Review and Revise Mainline A Generated Response Content**
   - Only started when Mainline A detects high-risk signals
   - Review response content about to be sent to user, revise if necessary to ensure safety
   - Output review results and revised response content

2. **Provide Structured Decision Signals for Rule Engine and Safety Script Routing**
   - Output decision signals that can be directly consumed by rule engine (such as `should_interrupt`, `should_route_to_safety_script`, `recommended_route`, etc.),
     used to trigger subsequent safety processes (including topic switching, referral, or other predefined intervention mechanisms).

**Implementation Method / Input Method (How)**:
- Execute Branch C prompt template through synchronous LLM call, only triggered when Mainline A `risk_screening` detects high risk;
- Main inputs include: Mainline A generated response content, trimmed session dialogue history, user basic information, etc.;
- Template guides the model to review response content safety, and provide revised version when necessary.

**Architecture Constraints / Data Boundary (Boundary)**:
- With Mainline A: Branch C works based on Mainline A's risk screening results, reviews and revises Mainline A generated response content;
- With rule engine: Rule engine based on Branch C output's `risk_level`, `risk_type` and decision signals, combined with global safety policy and script configuration, decides whether to interrupt current topic, switch to safety topic script, or trigger external safety processes.
- With script layer and safety topic scripts: Branch C only produces "which type of safety script to route to" recommendations (i.e., safety topic script identifier or category), safety handling details are implemented in independent safety topic scripts, following the same spec-workflow specification as regular topics.
- Performance and call method: Branch C only executes when high-risk signals are detected (~5-10% of conversations), response time 2-3 seconds, does not affect Mainline A's regular response path.

---

**Execution Frequency**: Conditionally triggered, only executes when Mainline A detects high risk (~5-10% of conversations)

**Template File**: `config/prompts/ai-say-branch-c.prompt`

**Template Content**:

```

[Branch C: Safety Review and Revision Engine]

You are a psychological crisis intervention expert, responsible for reviewing and revising potentially risky response content.

[Mainline A Generated Response Content]
{%mainline_response%}

[Complete Dialogue History]
{%full_chat_history%}

[User Basic Information]

- Education background: {%education_background%}
- Psychology knowledge: {%psychology_knowledge%}
- Emotional characteristics: {%emotional_characteristics%}

[Historical Risk Records]
{%risk_history%}

# Previously identified risk signals

[Your Task]

**Task 1: Review Response Content Safety**

- Check if response content has the following risks:
  - May trigger user suicide or self-harm behavior
  - May exacerbate user emotional crisis
  - May ignore user's emergency help signals
  - May provide inappropriate suggestions
- Output: needs_correction (boolean)

**Task 2: Revise Response Content (If Needed)**

- If correction is needed, provide revised response content:
  - Ensure content is safe and empathetic
  - Avoid triggering negative emotions
  - Provide suggestions to seek professional help when necessary
- Output: corrected_response (string)

**Task 3: Risk Level Assessment**

- Assess risk level:
  - low: No obvious risk
  - medium: Potential risk but not urgent
  - high: Obvious risk, needs immediate intervention
- Output: risk_level

**Task 4: Intervention Recommendations**

- If risk level is medium or high, provide intervention recommendations:
  - Immediate actions (referral, contact emergency contact, call police)
  - Conversation strategy adjustments (soothe, stabilize, establish safety)
  - Follow-up plan
- Output: intervention_recommendation

[Output Format]
Strictly output in the following JSON format:

{
"needs_correction": true|false,
"corrected_response": "Revised response content",
"correction_reason": "Reason for revision",
"risk_level": "low|medium|high",
"risk_assessment": {
"suicide_risk": 0-10,
"self_harm_risk": 0-10,
"emotional_crisis": 0-10,
"trauma_indicators": 0-10,
"reasoning": "Risk assessment reasoning..."
},
"intervention_recommendation": {
"immediate_action": "Immediate action recommendation...",
"conversation_adjustment": "Conversation strategy adjustment...",
"follow_up_plan": "Follow-up plan..."
}
}

```

**Variable Description**:
- `{%mainline_response%}` - Mainline A generated response content
- `{%full_chat_history%}` - Complete dialogue history
- `{%risk_history%}` - Historical risk records
- Other variables same as Mainline A

---

### Branch C: Monitor Layer (Risk Monitoring + Intervention)

#### Design Philosophy

**Responsibility Boundary (What)**:
1. **Detect and Grade Risk Signals in Current Session**
   - Based on current round dialogue and necessary historical information, identify whether there are safety-related risks such as suicide, self-harm, violence, abuse disclosure, severe somatic symptoms, etc.;
   - Output structured risk assessment results (such as `risk_type`, `risk_level`, `risk_signals`, `risk_assessment`, etc.), for comprehensive use by rule engine and Mainline A.

2. **Provide Safety-Oriented Suggestions or Alternative Copy for Current Round Response When Needed**
   - When medium-high level risk is detected, give safety-oriented response suggestions, or generate a safer alternative response draft, as basis for Mainline A to adjust/replace this round's response;
   - In extremely high-risk scenarios, provide routing recommendations for switching session to dedicated safety topic scripts (such as `safety_script_id`, `intervention_recommendation`).

3. **Provide Structured Decision Signals for Rule Engine and Safety Script Routing**
   - Output decision signals that can be directly consumed by rule engine (such as `should_interrupt`, `should_route_to_safety_script`, `recommended_route`, etc.),
     used to trigger subsequent safety processes (including topic switching, referral, or other predefined intervention mechanisms).

**Implementation Method / Input Method (How)**:
- Execute Branch C prompt template through asynchronous LLM call, does not block Mainline A's synchronous response;
- Main inputs include: trimmed session dialogue history (or necessary complete historical segments), user basic information (optional), historical risk records, etc., to support risk identification and grading;
- Template guides the model to output uniformly structured risk assessment results and intervention recommendations, avoiding hard-coding complete business logic in Mainline A.

**Architecture Constraints / Data Boundary (Boundary)**:
- With Mainline A: Branch C does not directly modify Mainline A's internal state, only affects Mainline A's this round response selection through structured results (e.g., as safety alternative copy or safety priority prompt); Mainline A refers to Branch C's `risk_assessment` and `intervention_recommendation` to adjust conversation strategy when needed.
- With rule engine: Rule engine based on Branch C output's `risk_level`, `risk_type` and decision signals, combined with global safety policy and script configuration, decides whether to interrupt current topic, switch to safety topic script, or trigger external safety processes.
- With script layer and safety topic scripts: Branch C only produces "which type of safety script to route to" recommendations (i.e., safety topic script identifier or category), safety handling details are implemented in independent safety topic scripts, following the same spec-workflow specification as regular topics.
- Performance and call method: Branch C executes with low priority, asynchronously (typical 3-5 second response), does not affect Mainline A's real-time response path; can be configured to "execute every round" or "only execute under specific trigger conditions" (e.g., when Mainline A `risk_screening` detects potential risk).

---

**Execution Frequency**: Asynchronous, every round (low priority, 3-5 second response)

**Template File**: `config/prompts/ai-say-branch-c.prompt`

**Template Content**:

```

[Branch C: Risk Monitoring and Intervention]

You are a psychological crisis intervention expert, responsible for monitoring risk signals in conversations and triggering interventions when necessary.

[Complete Dialogue History]
{%full_chat_history%}

[User Basic Information]

- Education background: {%education_background%}
- Psychology knowledge: {%psychology_knowledge%}
- Emotional characteristics: {%emotional_characteristics%}

[Historical Risk Records]
{%risk_history%}

# Previously identified risk signals

[Your Task]

**Task 1: Risk Signal Identification**

- Identify the following risk signals:
  - Suicidal tendencies (direct or indirect expression)
  - Self-harm behaviors (past or planned)
  - Severe emotional loss of control (anger, despair, panic)
  - Crisis events (trauma, violence, abuse)
  - Psychotic symptoms (hallucinations, delusions)
- Output: risk_signals (array)

**Task 2: Risk Level Assessment**

- Assess risk level:
  - low: No obvious risk
  - medium: Risk signals present but not urgent
  - high: Needs immediate intervention
- Output: risk_level

**Task 3: Intervention Recommendations**

- If risk level is medium or high, provide intervention recommendations:
  - Immediate actions (referral, contact emergency contact, call police)
  - Conversation strategy adjustments (soothe, stabilize, establish safety)
  - Follow-up plan
- Output: intervention_recommendation

[Output Format]
Strictly output in the following JSON format:

{
"risk_signals": ["Signal 1", "Signal 2"],
"risk_level": "low|medium|high",
"risk_assessment": {
"suicide_risk": 0-10,
"self_harm_risk": 0-10,
"emotional_crisis": 0-10,
"trauma_indicators": 0-10,
"reasoning": "Risk assessment reasoning..."
},
"intervention_recommendation": {
"immediate_action": "Immediate action recommendation...",
"conversation_adjustment": "Conversation strategy adjustment...",
"follow_up_plan": "Follow-up plan..."
}
}

````

**Variable Description**:
- `{%full_chat_history%}` - Complete dialogue history
- `{%risk_history%}` - Historical risk records
- Other variables same as Mainline A

---

## 🧩 ai_say Script Field Design Instructions (For CBT Engineers)

### 1. Field Classification Overview

The table below provides an overall classification of ai_say related script fields from a **CBT engineer perspective**. Note: This specifically refers to **fields within the `ai_say` object in `actions`**, not including outer `topic` / `phase` / `session`.

| Field | Classification | Main Purpose | Example Value |
|------|------|----------|--------|
| `description` / direct string | Required | Natural language content for this ai_say to explain/persuade, usually containing [Explanation Points] or [Persuasion Points] | `"The ABC model is a core concept of CBT, including three parts..."` |
| `concept` | Recommended | Tag the CBT concept corresponding to this explanation segment, for knowledge management and selecting appropriate templates | `"ABC Model"` |
| `subtype` | Recommended | Tag dialogue subtype (such as "introduce concept", "persuade trial", etc.), for selecting different prompts and assessment dimensions | `"introduce_concept"` |
| `max_rounds` | Advanced | Set **hard round limit** for this ai_say in special scenarios, ordinary scripts generally don't need to care | `5` |
| `exit_criteria` | Advanced | Write specialized exit rules for specific ai_say, to **tighten or override** system's generic exit logic | See below |
| `step_adjustment_rules` | Advanced | Define step adjustment rules for rule engine, used in collaboration with Branch B output's `step_adjustment_recommendation` | See below |

> Compatibility note: `- ai_say: "one-line prompt"` is semantically equivalent to `- ai_say: { description: "one-line prompt" }`.

### 2. Field Detailed Instructions

#### 2.1 `description` / Direct String Form

- **Field Name**: `description` (or let `ai_say` directly equal a string)
- **Required**: Yes (must be provided in at least one form)
- **Purpose Description**: Describe the explanation/persuasion task this ai_say needs to complete, is the merged result of [Explanation Topic], [Explanation Points], [Persuasion Points] in the prompt.
- **System Auto-Inferred**: No, completely written by CBT engineers.
- **Example Value**:

```yaml
- ai_say:
    description: |
      The ABC model is a core concept of CBT, including three parts:
      - A (Activating Event): Triggering event
      - B (Belief): Belief/thought
      - C (Consequence): Result/emotion
      The relationship between them is: A → B → C

      [Explanation Points]
      1. First introduce the three elements of ABC as a whole
      2. Use life-like examples to illustrate the A→B→C relationship
      3. Emphasize that B is key, not A directly causing C
      4. Guide user to give their own examples
````

Or use shorthand form:

```yaml
- ai_say: |
    The ABC model is a core concept of CBT, including three parts:
    - A (Activating Event): Triggering event
    - B (Belief): Belief/thought
    - C (Consequence): Result/emotion
    The relationship between them is: A → B → C
```

#### 2.2 `concept`

- **Field Name**: `concept`
- **Required**: No (recommended to fill)
- **Purpose Description**: Used to tag the CBT concept name corresponding to this explanation segment, for:
  - Statistics and retrieval in scripts/knowledge base;
  - Select different ai_say templates or strategies by concept;
  - Subsequent learning path and coverage analysis.
- **System Auto-Inferred**: Yes. When script doesn't fill `concept`, script semantic analysis service can give recommended concept based on `topic` + `description`; CBT engineers can also manually modify in tool interface.
- **Example Value**: `"ABC Model"`, `"Automatic Thoughts"`, `"Cognitive Distortions"`.

#### 2.3 `subtype`

- **Field Name**: `subtype`
- **Required**: No (recommended to fill, or auto-completed by system)
- **Purpose Description**: Tag the current ai_say's dialogue subtype, for example:
  - `introduce_concept`: Introduce a new CBT concept (such as ABC model, automatic thoughts, etc.);
  - `persuade`: Persuade/invite user to try a certain tool or homework;
  - `train_intro`: Before formal practice, introduce training steps or precautions.
    Different `subtype` will correspond to different:
  - Assessment dimensions (understanding level vs acceptance vs resistance level...);
  - Default exit logic;
  - Branch B / C used prompt templates.
- **System Auto-Inferred**: Yes. See "subtype Auto-Completion Mechanism" earlier in the document:
  - If `subtype` is not written in script, LLM will be called during script validation phase to recommend a subtype based on `topic` / `concept` / `description`;
  - Only when confidence is high enough will it auto-fill, otherwise handle with conservative default;
  - Once script author explicitly writes `subtype`, manual takes precedence.
- **Example Value**: `"introduce_concept"`, `"persuade"`, `"train_intro"`.

#### 2.4 `max_rounds`

- **Field Name**: `max_rounds`
- **Required**: No (advanced field, most scripts don't need to write)
- **Purpose Description**: Set protection upper limit for very few scenarios with **hard round limit** requirements, for example:
  - Certain teaching scripts require "at most 3 rounds of explanation, must end if exceeded";
  - Certain evaluation scenarios need fixed rounds for unified assessment of different script effects.
    In general counseling scenarios, counselors don't naturally think "I want 5 rounds or 6 rounds", but focus on "explain clearly / explain briefly / explain deeply", so CBT engineers are not required to fill this daily.
- **System Auto-Inferred**: Yes. System can derive a reasonable `max_rounds` based on:
  - `subtype` (e.g., `introduce_concept` / `persuade`);
  - Global configuration (default round limits for different scenarios);
    And combine exit conditions and assessment results to exit early.
- **Example Value**: `5`, `3` (only explicitly configured in special teaching/evaluation scripts).

#### 2.5 `exit_criteria`

- **Field Name**: `exit_criteria`
- **Required**: No (advanced field, configure as needed)
- **Purpose Description**: Define **structured exit rules** at rule engine layer, usually a set of `rules`:
  - Each rule consists of `condition` + `action` + `reason`;
  - Typical `condition` will reference Branch B output assessment fields, such as `understanding_level`, `has_questions`, `expressed_understanding`, `acceptance_level`, `resistance_score`, etc.;
  - `action` is usually `"exit"` or `"continue"`.
- **System Auto-Inferred**: Partially. Each `subtype` has a set of **generic default exit rules** (e.g.:
  - `introduce_concept` default: Understanding level ≥ 80 and no questions, or Understanding level ≥ 70 and expressed understanding → can exit;
  - `persuade` default: Acceptance level ≥ 70 and expressed willingness to try → can exit;
    So in most scripts, you don't need to write `exit_criteria`, just use default rules.
    When there are indeed special teaching/safety requirements, scripts can tighten or override default rules through `exit_criteria`.
- **Example Value**:

```yaml
exit_criteria:
  rules:
    - condition: 'understanding_level >= 80 AND has_questions == false'
      action: 'exit'
      reason: 'User has fully understood and has no questions'
    - condition: 'understanding_level >= 70 AND expressed_understanding == true'
      action: 'exit'
      reason: 'User expressed understanding intent and understanding level reached threshold'
    - else: 'continue'
```

#### 2.6 `step_adjustment_rules`

- **Field Name**: `step_adjustment_rules`
- **Required**: No (advanced field)
- **Purpose Description**: Provide **configurable step adjustment strategies** for rule engine, used in collaboration with Branch B output's `step_adjustment_recommendation`. For example:
  - Shorten explanation process when user understands particularly fast;
  - Insert "motivation stimulation" step when user resistance is high.
- **System Auto-Inferred**: Default no auto-generation; if not configured, system only uses Branch B's recommendations for lightweight adjustments, no complex script-level rules.
- **Example Value**:

```yaml
step_adjustment_rules:
  - name: 'Shorten explanation when understanding quickly'
    condition: 'understanding_level >= 90'
    action: 'skip_to_summary_step'
    reason: 'User understanding level is extremely high, can directly summarize and exit'
```

### 3. Design Principle Instructions

#### 3.1 Why CBT Engineers Are Not Required to Fill `max_rounds`

- In real counseling and teaching scenarios, counselors are more accustomed to thinking in **fuzzy language**:
  - "Briefly explain" / "Explain in detail" / "Today only focus on laying groundwork for concepts"
    Rather than "Exactly explain 3 rounds or 5 rounds".
- If mandatory to fill `max_rounds`, it brings two problems:
  - Increases script writing burden, and doesn't match counselors' natural thinking style;
  - Once parameters are fixed, if strategy needs adjustment later, need to modify each script individually, high maintenance cost.
- Therefore, the design chooses:
  - **Not require** CBT engineers to fill `max_rounds`;
  - System derives a reasonable upper limit based on `subtype` + global configuration;
  - Real exit is still decided by assessment dimensions like "understanding level / acceptance / fatigue level", not purely by round count.

#### 3.2 Why `subtype` and `concept` Can Be Auto-Identified

- For CBT engineers, the most natural working style is:
  - Give each topic a `topic`;
  - Write clearly `description` / `topic_description`, describing what to explain and how to explain.
- `subtype` and `concept` are closer to "**system-internal classification tags**", mainly used for:
  - Select different subtype prompt templates and assessment dimensions;
  - Do knowledge management and script statistics.
- Therefore:
  - Design `subtype` / `concept` as **recommended fields**, can be filled or not;
  - During script validation phase, through one LLM call auto-infer:
    - Not filled → Attempt to identify and complete;
    - Already filled → Script author intent takes precedence, only do consistency check and report.
- This preserves **advanced user controllability** while avoiding forcing most CBT engineers to learn too many system-internal terms.

#### 3.3 Why `exit_criteria` Should Have Generic Default Rules

- Exit decision is ai_say's "**framework-level capability**", each subtype can have a set of validated default rules:
  - For example, `introduce_concept` focuses on understanding level and whether there are unresolved questions;
  - `persuade` focuses on acceptance, resistance level, and willingness to try.
- If requiring each ai_say to handwrite `exit_criteria`:
  - Error-prone, and inconsistent style between scripts;
  - CBT engineers will be overwhelmed by large amounts of technical details (conditional expressions, field names, etc.).
- Therefore:
  - **Default case**: System applies a set of generic exit rules by subtype;
  - **Only when there are clear business requirements**, suggest tightening or overriding default rules through `exit_criteria` (e.g., teaching assessment, risk-sensitive topics).

#### 3.4 Balance Between Simple Easy-to-Use vs Advanced Controllable

- For most CBT engineers:
  - Only need to focus on business semantics itself: `topic` + `description`;
  - Can optionally tag `concept` for subsequent statistics and retrieval;
  - Don't need to understand technical details of `max_rounds` / `exit_criteria` / `step_adjustment_rules`.
- For advanced users and architects:
  - Can finely control exit logic and step adjustment when needed;
  - Through explicit configuration of `subtype` / `max_rounds` / `exit_criteria` / `step_adjustment_rules`, achieve highly controllable, highly testable behavior.
- Design goal:
  - **"Out of the box"**: Only fill required fields to get reasonable behavior;
  - **"Progressive unlock"**: Open recommended and advanced fields when needed, doesn't affect existing scripts.

### 4. Script Example: Simplified Version vs Complete Version

#### 4.1 Simplified Script (For Ordinary CBT Engineers)

```yaml
sessions:
  - session: 'ABC Model Introduction'
    phases:
      - phase: 'Concept Introduction'
        steps:
          - topic: 'ABC Model Core Concept'
            actions:
              - ai_say: |
                  The ABC model is a core concept of CBT, including three parts:
                  - A (Activating Event): Triggering event
                  - B (Belief): Belief/thought
                  - C (Consequence): Result/emotion
                  The relationship between them is: A → B → C

                  [Explanation Points]
                  1. First introduce the three elements of ABC as a whole
                  2. Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship
                  3. Emphasize that B (thought) is key, not A directly causing C
                  4. Guide user to give their own examples
```

> Note: Here only filled required business semantics (`topic` + `ai_say` content), other fields are handled by system with default strategy.

#### 4.2 Complete Script (For Advanced Users)

```yaml
sessions:
  - session: 'ABC Model Introduction'
    phases:
      - phase: 'Concept Introduction'
        steps:
          - topic: 'ABC Model Core Concept'
            actions:
              - ai_say:
                  description: |
                    The ABC model is a core concept of CBT, including three parts:
                    - A (Activating Event): Triggering event
                    - B (Belief): Belief/thought
                    - C (Consequence): Result/emotion
                    The relationship between them is: A → B → C

                    [Explanation Points]
                    1. First introduce the three elements of ABC as a whole
                    2. Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship
                    3. Emphasize that B (thought) is key, not A directly causing C
                    4. Guide user to give their own examples
                  concept: 'ABC Model'
                  subtype: 'introduce_concept'
                  max_rounds: 5
                  exit_criteria:
                    rules:
                      - condition: 'understanding_level >= 80 AND has_questions == false'
                        action: 'exit'
                        reason: 'User has fully understood and has no questions'
                      - condition: 'understanding_level >= 70 AND expressed_understanding == true'
                        action: 'exit'
                        reason: 'User expressed understanding intent and understanding level reached threshold'
                      - else: 'continue'
                  step_adjustment_rules:
                    - name: 'Shorten explanation when understanding quickly'
                      condition: 'understanding_level >= 90'
                      action: 'skip_to_summary_step'
                      reason: 'User understanding level is extremely high, can directly summarize and exit'
```

> Note: This version shows the combined usage of all common fields, suitable for advanced scenarios requiring fine control of exit logic and step adjustment.

## 🎬 Application Scenario 1: Introducing the ABC Model

### Scenario Description

**Goal**: Introduce the core concept of CBT, the ABC model, to the client

**User Profile**:

- Name: Xiao Ming
- Education background: Bachelor's degree
- Psychology knowledge: None
- Learning style: Visual, likes concrete examples
- Cognitive characteristics: Strong logical thinking
- Emotional characteristics: Prone to anxiety
- Vocabulary level: Medium
- Language style: Colloquial
- Common expressions: "That is to say", "I get it", "Not quite clear"

### YAML Script

```yaml
sessions:
  - session: 'ABC Model Introduction'
    declare:
      - var: client_name
        value: Xiao Ming
      - var: counselor_name
        value: Teacher Li
      - var: education_background
        value: Bachelor's degree
      - var: psychology_knowledge
        value: None
      - var: learning_style
        value: Visual, likes concrete examples
      - var: cognitive_characteristics
        value: Strong logical thinking
      - var: emotional_characteristics
        value: Prone to anxiety
      - var: vocabulary_level
        value: Medium
      - var: language_style
        value: Colloquial
      - var: user_common_expressions
        value: That is to say, I get it, Not quite clear
      # Recommended: Also maintain an aggregated script-layer user profile variable for Branch B/domain adapter layer to directly consume
      - var: user_profile
        value: |
          Name: Xiao Ming
          Education background: Bachelor's degree
          Psychology knowledge: None
          Learning style: Visual, likes concrete examples
          Cognitive characteristics: Strong logical thinking
          Emotional characteristics: Prone to anxiety
          Vocabulary level: Medium
          Language style: Colloquial
          Common expressions: "That is to say", "I get it", "Not quite clear"

    phases:
      - phase: 'Concept Introduction'
        steps:
          - topic: 'ABC Model Core Concept'
            actions:
              - ai_say: |
                  The ABC model is a core concept of CBT, including three parts:
                  - A (Activating Event): Triggering event
                  - B (Belief): Belief/thought
                  - C (Consequence): Result/emotion
                  The relationship between them is: A → B → C

                  [Explanation Points]
                  1. First introduce the three elements of ABC as a whole
                  2. Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship
                  3. Emphasize that B (thought) is key, not A directly causing C
                  4. Guide user to give their own examples
                subtype: 'introduce_concept'
                concept: 'ABC Model'
                max_rounds: 5

                # Assessment scenario (executed by Branch B)
                # Generally auto-mapped by subtype, no need to explicitly configure in script

                # Exit conditions (executed by rule engine)
                exit_criteria:
                  rules:
                    - condition: 'understanding_level >= 80 AND has_questions == false'
                      action: 'exit'
                      reason: 'User has fully understood and has no questions'
                    - condition: 'understanding_level >= 70 AND expressed_understanding == true'
                      action: 'exit'
                      reason: 'User expressed understanding intent and understanding level reached threshold'
                    - else: 'continue'
```

### Simulated Context (Round 1 Dialogue)

**Dialogue History**: (Empty, this is the first round)

**User's Latest Message**: "Dr. Li, hello! I'd like to understand how CBT works."

**Branch B Output** (Initialization):

```json
{
  "assessment": {
    "identified_questions": ["How CBT works"],
    "understanding_level": 0,
    "expressed_understanding": false,
    "emotional_state": "Positive",
    "emotion_intensity": 2,
    "topic_alignment": 1.0,
    "resistance_score": 0,
    "cognitive_readiness": 8,
    "has_questions": true,
    "reasoning": "User actively asked about CBT working principles, showing learning willingness, positive emotion, high cognitive readiness"
  },
  "assessment_summary": [
    "Understanding level: 0 points",
    "Has questions: Yes",
    "Expressed understanding: No",
    "Emotional state: Positive",
    "Resistance level: 0 points"
  ],
  "base_steps": [
    "Step 1: Introduce the three elements of ABC model as a whole in simple language (A, B, C)",
    "Step 2: Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship",
    "Step 3: Guide user to give their own examples and apply ABC model to explain"
  ],
  "progress_summary": "Just started introducing ABC model",
  "strategy_steps": {
    "planned_steps": [
      "Step 1: Introduce the three elements of ABC model as a whole in simple language (A, B, C)",
      "Step 2: Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship",
      "Step 3: Guide user to give their own examples and apply ABC model to explain"
    ],
    "current_step_index": 1,
    "total_steps": 3,
    "step_description": "Introduce the three elements of ABC model as a whole in simple language (A, B, C)",
    "next_step_focus": "Use life-like examples to help understand the A→B→C relationship"
  },
  "current_step_completion": {
    "is_completed": false,
    "completion_percentage": 10
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "First round of explanation, proceed with original step plan"
  },
  "strategy_prompt": "[Communication Strategy]\n- Language style: Use colloquial expressions (user vocabulary level medium), avoid professional terminology, use transition words like 'that is to say' (user common expressions)\n- Example selection: Prepare a life-like example about anxiety (such as exam anxiety), matching user's visual learning style\n- Rapport building: Acknowledge user's learning willingness, build collaborative relationship, note user's anxiety-prone characteristic\n- Guidance strategy: First introduce as a whole, then explain individually, finally connect with examples (matching user's strong logical thinking characteristic)"
}
```

### Complete Prompt After Variable Substitution (Mainline A - Round 1)

```
Current time 2025-01-14 16:50, you are Teacher Li. Please continue the conversation and generate a response for Xiao Ming.

[Explanation Topic]
# Note: This can contain complex business logic, written by CBT engineers
The ABC model is a core concept of CBT, including three parts:
- A (Activating Event): Triggering event
- B (Belief): Belief/thought
- C (Consequence): Result/emotion
The relationship between them is: A → B → C

[Explanation Points]
1. First introduce the three elements of ABC as a whole
2. Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship
3. Emphasize that B (thought) is key, not A directly causing C
4. Guide user to give their own examples

[Current Explanation Progress]
Just started introducing ABC model

[Current Strategy Step]
You are executing step 1/3: Introduce the three elements of ABC model in simple language
Next step focus: Use life-like examples to help understand

[Communication Strategy]
# Note: This strategy is generated by Branch B based on user profile, already containing the essence of user characteristics
- Language style: Use colloquial expressions (user vocabulary level medium), avoid professional terminology, use transition words like 'that is to say' (user common expressions)
- Example selection: Prepare a life-like example about anxiety (such as exam anxiety), matching user's visual learning style
- Rapport building: Acknowledge user's learning willingness, build collaborative relationship, note user's anxiety-prone characteristic
- Guidance strategy: First introduce as a whole, then explain individually, finally connect with examples (matching user's strong logical thinking characteristic)

[Recent Dialogue Window] (Only contains the most recent rounds, respond directly to the last user message)
Xiao Ming: "Dr. Li, hello! I'd like to understand how CBT works."

[Your Task]

1. **Execute Business Logic**:
   - Generate your response according to the requirements of [Explanation Topic] and [Explanation Points]
   - Apply the guidance in [Communication Strategy]
   - Ensure the response aligns with the focus of the current strategy step

2. **Determine Whether to Exit**:
   - Client response assessment:
     - Understanding level: 0 points (just started)
     - Has questions: Yes (user asked about CBT working principles)
     - Expressed understanding: No
     - Emotional state: Positive
     - Resistance level: 0 points

   - Exit conditions (defined by script):
     - Understanding level >= 80 and no questions → Exit
     - Understanding level >= 70 and expressed understanding → Exit
     - Other cases → Continue

   - Please determine whether to exit the current topic

3. **Quick Risk Screening**:
   - Based on the most recent user reply and conversation history, determine if the following risks exist (suicide/self-harm, crisis emotion, severe cognitive distortion, therapeutic alliance rupture)
   - Please truthfully fill in the screening results in the output risk_screening field (urgent_risk_detected and risk_type)


[Output Format]
Strictly output in the following JSON format:

{
  "response": {
    "Counselor": "Your response content..."
  },
  "exit": true|false,
  "exit_reason": "Exit reason or continue reason...",
  "risk_screening": {
    "urgent_risk_detected": true|false,
    "risk_type": "suicide|self_harm|crisis_emotion|severe_distortion|alliance_rupture|null"
  }
}
```

### Simulated LLM Output (Mainline A - Round 1)

```json
{
  "response": {
    "Counselor": "Hello Xiao Ming! I'm glad you want to understand CBT. The core of CBT is actually something called the ABC model, which is very easy to understand. That is to say, we look at an event in three parts: A is what happened, B is your thought about it, and C is your emotional reaction. For example, before an exam (this is A), if you think 'I'm definitely going to fail' (this is B), then you'll be very anxious (this is C). The key is, it's not A that directly causes C, but your thought B that plays a role in between. Do you think this way of thinking is easy to understand?"
  },
  "exit": false,
  "exit_reason": "User just started learning, understanding level is 0 points, has questions needing answers, doesn't meet exit conditions, continue explaining",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**Rule Engine Judgment**:

```typescript
// Client response assessment
const assessment = {
  understanding_level: 0,
  has_questions: true,
  expressed_understanding: false,
};

// Execute exit rules
// Rule 1: understanding_level >= 80 AND has_questions == false → Not met
// Rule 2: understanding_level >= 70 AND expressed_understanding == true → Not met
// Result: continue

// Mainline A's LLM judgment as fallback, result consistent: exit = false
```

---

### Simulated Context (Round 2 Dialogue)

**Dialogue History**:

```
Teacher Li: Hello Xiao Ming! I'm glad you want to understand CBT. The core of CBT is actually something called the ABC model, which is very easy to understand. That is to say, we look at an event in three parts: A is what happened, B is your thought about it, and C is your emotional reaction. For example, before an exam (this is A), if you think 'I'm definitely going to fail' (this is B), then you'll be very anxious (this is C). The key is, it's not A that directly causes C, but your thought B that plays a role in between. Do you think this way of thinking is easy to understand?
```

**User's Latest Message**: "Hmm, I kind of get it. That is to say, for the same exam, if I think differently, my emotions will be different too, right?"

**Branch B Output** (Round 2):

```json
{
  "assessment": {
    "identified_questions": [],
    "understanding_level": 65,
    "expressed_understanding": true,
    "emotional_state": "Positive",
    "emotion_intensity": 3,
    "topic_alignment": 1.0,
    "resistance_score": 0,
    "cognitive_readiness": 8,
    "has_questions": false,
    "reasoning": "User understood the core logic of B affecting C, expressed understanding intent ('kind of get it'), but hasn't fully grasped the complete ABC relationship, hasn't given their own example"
  },
  "progress_summary": "User has understood the core logic of B affecting C, but understanding of complete ABC relationship is not yet deep enough",
  "strategy_steps": {
    "planned_steps": [
      "Step 1: Introduce the three elements of ABC model as a whole in simple language (A, B, C)",
      "Step 2: Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship",
      "Step 3: Guide user to give their own examples and apply ABC model to explain"
    ],
    "current_step_index": 2,
    "total_steps": 3,
    "step_description": "Confirm user understanding, use more examples to deepen ABC relationship",
    "next_step_focus": "Guide user to give their own examples"
  },
  "current_step_completion": {
    "is_completed": false,
    "completion_percentage": 60
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "Current pacing is reasonable, can continue deepening understanding according to original step plan"
  },
  "strategy_prompt": "[Communication Strategy]\n- Language style: First acknowledge user's understanding (user likes to be validated), then use 'Yes, that's exactly it' to reinforce\n- Example selection: Give another counter-example (same event, different thought, different emotion), matching user's visual learning style\n- Rapport building: Acknowledge user's understanding progress, encourage continued thinking\n- Guidance strategy: Use open-ended questions to guide user to give their own examples (matching user's strong logical thinking characteristic)"
}
```

### Complete Prompt After Variable Substitution (Mainline A - Round 2)

```
Current time 2025-01-14 16:52, you are Teacher Li. Please continue the conversation and generate a response for Xiao Ming.

[Explanation Topic]
(Same as Round 1, omitted)

[Current Explanation Progress]
User has understood the core logic of B affecting C, but understanding of complete ABC relationship is not yet deep enough

[Current Strategy Step]
You are executing step 2/3: Confirm user understanding, use more examples to deepen ABC relationship
Next step focus: Guide user to give their own examples

[Communication Strategy]
- Language style: First acknowledge user's understanding (user likes to be validated), then use 'Yes, that's exactly it' to reinforce
- Example selection: Give another counter-example (same event, different thought, different emotion), matching user's visual learning style
- Rapport building: Acknowledge user's understanding progress, encourage continued thinking
- Guidance strategy: Use open-ended questions to guide user to give their own examples (matching user's strong logical thinking characteristic)

[Recent Dialogue Window] (Only contains the most recent rounds, respond directly to the last user message)
Teacher Li: Hello Xiao Ming! I'm glad you want to understand CBT. The core of CBT is actually something called the ABC model, which is very easy to understand. That is to say, we look at an event in three parts: A is what happened, B is your thought about it, and C is your emotional reaction. For example, before an exam (this is A), if you think 'I'm definitely going to fail' (this is B), then you'll be very anxious (this is C). The key is, it's not A that directly causes C, but your thought B that plays a role in between. Do you think this way of thinking is easy to understand?
Xiao Ming: "Hmm, I kind of get it. That is to say, for the same exam, if I think differently, my emotions will be different too, right?"

[Your Task]

1. **Execute Business Logic**:
   - Generate your response according to the requirements of [Explanation Topic]
   - Apply the guidance in [Communication Strategy]
   - Ensure the response aligns with the focus of the current strategy step

2. **Determine Whether to Exit**:
   - Client response assessment:
     - Understanding level: 65 points
     - Has questions: No
     - Expressed understanding: Yes ("kind of get it")
     - Emotional state: Positive
     - Resistance level: 0 points

   - Exit conditions:
     - Understanding level >= 80 and no questions → Exit (not met, understanding level 65 < 80)
     - Understanding level >= 70 and expressed understanding → Exit (not met, understanding level 65 < 70)
     - Other cases → Continue

   - Please determine whether to exit the current topic

3. **Quick Risk Screening**:
   - Based on the most recent user reply and conversation history, determine if the following risks exist (suicide/self-harm, crisis emotion, severe cognitive distortion, therapeutic alliance rupture)
   - Please truthfully fill in the screening results in the output risk_screening field (urgent_risk_detected and risk_type)


[Output Format]
(Same as Round 1)
```

### Simulated LLM Output (Mainline A - Round 2)

```json
{
  "response": {
    "Counselor": "Yes! That's exactly it! You understood it very accurately. For the same exam event (A), if you think 'I'm pretty well prepared, should be fine' (B), you might feel relatively calm or even a bit confident (C). But if you think 'I'm definitely going to fail' (B), you'll be very anxious (C). You see, the event A is the same, but the thought B is different, and the emotion C becomes completely different. Can you think of a similar example in your own life? Like something you encountered where different thoughts led to different feelings?"
  },
  "exit": false,
  "exit_reason": "User understanding level is 65 points, although expressed understanding intent, hasn't reached 70 point threshold, need to continue deepening understanding",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**Rule Engine Judgment**:

```typescript
// Client response assessment
const assessment = {
  understanding_level: 65,
  has_questions: false,
  expressed_understanding: true,
};

// Execute exit rules
// Rule 1: understanding_level >= 80 AND has_questions == false → Not met (65 < 80)
// Rule 2: understanding_level >= 70 AND expressed_understanding == true → Not met (65 < 70)
// Result: continue
```

---

### Simulated Context (Round 3 Dialogue)

**Dialogue History**:

```
Teacher Li: Hello Xiao Ming! I'm glad you want to understand CBT. The core of CBT is actually something called the ABC model, which is very easy to understand. That is to say, we look at an event in three parts: A is what happened, B is your thought about it, and C is your emotional reaction. For example, before an exam (this is A), if you think 'I'm definitely going to fail' (this is B), then you'll be very anxious (this is C). The key is, it's not A that directly causes C, but your thought B that plays a role in between. Do you think this way of thinking is easy to understand?

Xiao Ming: Hmm, I kind of get it. That is to say, for the same exam, if I think differently, my emotions will be different too, right?

Teacher Li: Yes! That's exactly it! You understood it very accurately. For the same exam event (A), if you think 'I'm pretty well prepared, should be fine' (B), you might feel relatively calm or even a bit confident (C). But if you think 'I'm definitely going to fail' (B), you'll be very anxious (C). You see, the event A is the same, but the thought B is different, and the emotion C becomes completely different. Can you think of a similar example in your own life? Like something you encountered where different thoughts led to different feelings?
```

**User's Latest Message**: "Let me think... Like when my boss criticized me, if I thought 'he's helping me improve', I wouldn't feel so bad. But if I thought 'he's targeting me', I'd be very angry. Is this also the ABC model?"

**Branch B Output** (Round 3):

```json
{
  "assessment": {
    "identified_questions": ["Is this also the ABC model?"],
    "understanding_level": 85,
    "expressed_understanding": true,
    "emotional_state": "Positive",
    "emotion_intensity": 5,
    "topic_alignment": 1.0,
    "resistance_score": 0,
    "cognitive_readiness": 9,
    "has_questions": true,
    "reasoning": "User was able to give their own example, accurately identified the three elements A, B, C, understanding level reached standard. Although has question ('Is this also the ABC model?'), this is a confirmatory question, not real confusion"
  },
  "progress_summary": "User has fully understood the core logic of ABC model, can accurately identify A, B, C three elements, and can apply to their own life",
  "strategy_steps": {
    "planned_steps": [
      "Step 1: Introduce the three elements of ABC model as a whole in simple language (A, B, C)",
      "Step 2: Use life-like examples (such as exam anxiety) to illustrate the A→B→C relationship",
      "Step 3: Guide user to give their own examples and apply ABC model to explain"
    ],
    "current_step_index": 3,
    "total_steps": 3,
    "step_description": "Confirm user understanding, summarize key points, prepare to exit",
    "next_step_focus": "Affirm user's understanding, briefly summarize ABC model's value"
  },
  "current_step_completion": {
    "is_completed": true,
    "completion_percentage": 100
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "Exit conditions reached, no need to adjust step plan"
  },
  "strategy_prompt": "[Communication Strategy]\n- Language style: Enthusiastically affirm user's example (user likes to be validated), use 'Exactly right' to reinforce\n- Example selection: No new examples needed, directly confirm user's example\n- Rapport building: Appreciate user's learning ability and application ability\n- Guidance strategy: Briefly summarize ABC model's value, pave way for next topic"
}
```

### Simulated LLM Output (Mainline A - Round 3)

```json
{
  "response": {
    "Counselor": "Exactly right! The example you gave is perfect! When your boss criticized you (A), if you thought 'he's helping me improve' (B), you wouldn't feel so bad (C); but if you thought 'he's targeting me' (B), you'd be very angry (C). This is the standard ABC model! You see, mastering the ABC model, you can understand why the same event can cause different emotional reactions in different people, and even the same person can have different reactions at different times. This is the core idea of CBT: change your thoughts, and you can change your emotions. You've completely understood the ABC model!"
  },
  "exit": true,
  "exit_reason": "User understanding level is 85 points, reached exit threshold of 80 points, and can give their own examples, meets exit conditions",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**Rule Engine Judgment**:

```typescript
// Client response assessment
const assessment = {
  understanding_level: 85,
  has_questions: true, // Note: This is a confirmatory question, not real confusion
  expressed_understanding: true,
};

// Execute exit rules
// Rule 1: understanding_level >= 80 AND has_questions == false → Not met (has_questions = true)
// Rule 2: understanding_level >= 70 AND expressed_understanding == true → Met! (85 >= 70 and expressed_understanding = true)
// Result: exit

// Mainline A's LLM judgment as fallback, result consistent: exit = true
```

**System Final Decision**: Rule engine judges exit, Mainline A LLM also judges exit, end current topic.

---

## 🎬 Application Scenario 2: Persuading User to Try Thought Record

### Scenario Description

**Goal**: Persuade client to try using a thought record form (a CBT tool)

**User Profile**:

- Name: Xiao Hong
- Education background: High school
- Psychology knowledge: None
- Learning style: Practical, likes direct action
- Cognitive characteristics: Concrete thinking, dislikes abstract concepts
- Emotional characteristics: Prone to resistance, dislikes troublesome things
- Vocabulary level: Average
- Language style: Direct, concise
- Common expressions: "Too troublesome", "I'll try it", "Is this useful?"

### YAML Script

```yaml
sessions:
  - session: 'Thought Record Tool Introduction'
    variables:
      session:
        user_name: 'Xiao Hong'
        counselor_name: 'Dr. Wang'
        # User profile (only used in Branch B)
        education_background: 'High school'
        psychology_knowledge: 'None'
        learning_style: 'Practical, likes direct action'
        cognitive_characteristics: 'Concrete thinking, dislikes abstract concepts'
        emotional_characteristics: 'Prone to resistance, dislikes troublesome things'
        vocabulary_level: 'Average'
        language_style: 'Direct, concise'
        user_common_expressions: "Too troublesome, I'll try it, Is this useful?"

    phases:
      - phase: 'Tool Introduction and Persuasion'
        steps:
          - topic: 'Thought Record Form Value'
            actions:
              - ai_say:
                  concept: 'Thought Record Form'
                  description: |
                    The thought record form is a simple tool that helps you record:
                    1. What happened (A)
                    2. What you thought at the time (B)
                    3. What emotion you had (C)
                    Through recording, you can more clearly see your thinking patterns.

                    [Persuasion Points]
                    1. Emphasize simplicity and ease of use (addressing user's fear of trouble)
                    2. Emphasize practical effects (addressing user's practical nature)
                    3. Provide concrete examples (addressing user's concrete thinking)
                    4. Lower commitment threshold (try once, don't require long-term persistence)

                    [Specific Risk Concerns]
                    - When reviewing certain events, user's emotion may suddenly rise to extreme distress (need to watch for crisis emotions)
                    - User may misunderstand that record content will be seen by others or used for judgment (need to clarify privacy and purpose)

                  subtype: 'persuade'
                  max_rounds: 5

                  # Assessment scenario (executed by Branch B)
                  # Usually determined with subtype, no need to explicitly configure in script

                  # Exit conditions (executed by rule engine)
                  exit_criteria:
                    rules:
                      - condition: 'acceptance_level >= 70 AND expressed_willingness == true'
                        action: 'exit'
                        reason: 'User acceptance level reached standard and expressed willingness to try'
                      - condition: 'resistance_score >= 8 AND rounds >= 3'
                        action: 'exit'
                        reason: 'User resistance level is high, multiple persuasion attempts ineffective, avoid over-selling'
                      - else: 'continue'

                  # Step adjustment rules (executed by rule engine + Branch B collaboration)
                  step_adjustment_rules:
                    - name: 'Shorten persuasion process when quickly accepted'
                      condition: 'acceptance_level >= 80 AND expressed_willingness == true'
                      action: 'skip_to_summary_step'
                      reason: 'User already highly accepting, can directly enter summary and action guidance'
                    - name: 'Add motivation stimulation step when high resistance'
                      condition: 'resistance_score >= 8'
                      action: 'insert_motivation_step'
                      reason: 'User resistance level is relatively high, need to first increase intrinsic motivation'
```

### Simulated Context (Round 1 Dialogue)

**Dialogue History**:

```
Dr. Wang: Xiao Hong, we talked about the ABC model last time, you understood it very well. Today I'd like to introduce a tool that can help you better understand your thoughts.
```

**User's Latest Message**: "What tool? Won't it be too troublesome?"

**Branch B Output** (Initialization):

```json
{
  "assessment": {
    "identified_questions": ["What tool", "Won't it be too troublesome"],
    "understanding_level": 0,
    "expressed_understanding": false,
    "emotional_state": "Resistant",
    "emotion_intensity": 4,
    "topic_alignment": 1.0,
    "resistance_score": 6,
    "cognitive_readiness": 7,
    "has_questions": true,
    "acceptance_level": 0,
    "expressed_willingness": false,
    "reasoning": "User shows resistance tendency toward the tool ('Won't it be too troublesome'), resistance level is moderate (6 points), need to reduce resistance"
  },
  "assessment_summary": [
    "Acceptance level: 0 points",
    "Resistance level: 6 points",
    "Expressed willingness to try: No",
    "Still has major concerns: Yes"
  ],
  "base_steps": [
    "Step 1: Introduce tool's simplicity and practicality, reduce user's resistance",
    "Step 2: Use concrete examples to show tool's ease of use and practical effects",
    "Step 3: Invite user to try one thought record, lower commitment threshold"
  ],
  "progress_summary": "Just started introducing thought record form, user shows resistance tendency",
  "strategy_steps": {
    "planned_steps": [
      "Step 1: Introduce tool's simplicity and practicality, reduce user's resistance",
      "Step 2: Use concrete examples to show tool's ease of use and practical effects",
      "Step 3: Invite user to try one thought record, lower commitment threshold"
    ],
    "current_step_index": 1,
    "total_steps": 3,
    "step_description": "Introduce tool's simplicity and practicality, reduce user's resistance",
    "next_step_focus": "Use concrete examples to show tool's ease of use and practical effects"
  },
  "current_step_completion": {
    "is_completed": false,
    "completion_percentage": 10,
    "reasoning": "Just started executing step 1, only completed initial introduction, haven't entered example and invitation to try parts yet"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "First round only needs to proceed with original plan, no need to adjust step plan"
  },
  "strategy_prompt": "[Communication Strategy]\n- Language style: Direct, concise (user language style), avoid long-winded explanations, use 'very simple', 'just a few minutes' to reduce resistance (addressing user's fear of trouble)\n- Example selection: Use a super simple example (3 questions, 1 minute to complete), matching user's practical learning style\n- Rapport building: Understand user's psychology of not liking trouble, emphasize 'not troublesome'\n- Guidance strategy: First promise simplicity, then show value, finally invite to try (matching user's concrete thinking characteristic)"
}
```

### Complete Prompt After Variable Substitution (Mainline A - Round 1)

```
Current time 2025-01-14 17:00, you are Dr. Wang. Please continue the conversation and generate a response for Xiao Hong.

[Explanation Topic]
The thought record form is a simple tool that helps you record:
1. What happened (A)
2. What you thought at the time (B)
3. What emotion you had (C)
Through recording, you can more clearly see your thinking patterns.

[Persuasion Points]
1. Emphasize simplicity and ease of use (addressing user's fear of trouble)
2. Emphasize practical effects (addressing user's practical nature)
3. Provide concrete examples (addressing user's concrete thinking)
4. Lower commitment threshold (try once, don't require long-term persistence)

[Current Explanation Progress]
Just started introducing thought record form, user shows resistance tendency

[Current Strategy Step]
You are executing step 1/3: Introduce tool's simplicity and practicality, reduce user's resistance
Next step focus: Use concrete examples to show tool's ease of use

[Communication Strategy]
- Language style: Direct, concise (user language style), avoid long-winded explanations, use 'very simple', 'just a few minutes' to reduce resistance (addressing user's fear of trouble)
- Example selection: Use a super simple example (3 questions, 1 minute to complete), matching user's practical learning style
- Rapport building: Understand user's psychology of not liking trouble, emphasize 'not troublesome'
- Guidance strategy: First promise simplicity, then show value, finally invite to try (matching user's concrete thinking characteristic)

[Recent Dialogue Window] (Only contains the most recent rounds, respond directly to the last user message)
Dr. Wang: Xiao Hong, we talked about the ABC model last time, you understood it very well. Today I'd like to introduce a tool that can help you better understand your thoughts.
Xiao Hong: "What tool? Won't it be too troublesome?"

[Your Task]

1. **Execute Business Logic**:
   - Generate your response based on the requirements of [Explanation Topic] and [Persuasion Points]
   - Apply the guidance in [Communication Strategy]
   - Ensure the response aligns with the focus of the current strategy step

2. **Determine Whether to Exit**:
   - Client response assessment:
     - Acceptance level: 0 points (just started)
     - Resistance level: 6 points (moderate)
     - Expressed willingness to try: No
     - Has questions: Yes

   - Exit conditions (defined by script):
     - Acceptance level >= 70 and expressed willingness to try → Exit
     - Resistance level >= 8 and rounds >= 3 → Exit (avoid over-selling)
     - Other cases → Continue

   - Please determine whether to exit the current topic

3. **Quick Risk Screening**:
   - Based on the most recent user reply and conversation history, determine if the following risks exist (suicide/self-harm, crisis emotion, severe cognitive distortion, therapeutic alliance rupture)
   - Please truthfully fill in the screening results in the output risk_screening field (urgent_risk_detected and risk_type)


[Output Format]
(Same as Scenario 1)
```

### Simulated LLM Output (Mainline A - Round 1)

```json
{
  "response": {
    "Counselor": "Not troublesome at all! It's just a very simple form called a thought record. You only need to answer three questions: What happened? What did you think at the time? What did you feel? That's it, one minute to fill out. For example, you were late today (event), you thought 'the boss is definitely going to scold me' (thought), and then you were very nervous (feeling). Just write it down. This tool can help you see clearly how your thoughts affect your emotions."
  },
  "exit": false,
  "exit_reason": "User just started learning about the tool, acceptance level is 0 points, resistance level is 6 points (moderate), need to continue persuading",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**Rule Engine Judgment**:

```typescript
// Client response assessment
const assessment = {
  acceptance_level: 0,
  resistance_score: 6,
  expressed_willingness: false,
  rounds: 1,
};

// Execute exit rules
// Rule 1: acceptance_level >= 70 AND expressed_willingness == true → Not met
// Rule 2: resistance_score >= 8 AND rounds >= 3 → Not met
// Result: continue
```

---

### Simulated Context (Round 2 Dialogue)

**Dialogue History**:

```
Dr. Wang: Xiao Hong, we talked about the ABC model last time, you understood it very well. Today I'd like to introduce a tool that can help you better understand your thoughts.

Xiao Hong: What tool? Won't it be too troublesome?

Dr. Wang: Not troublesome at all! It's just a very simple form called a thought record. You only need to answer three questions: What happened? What did you think at the time? What did you feel? That's it, one minute to fill out. For example, you were late today (event), you thought 'the boss is definitely going to scold me' (thought), and then you were very nervous (feeling). Just write it down. This tool can help you see clearly how your thoughts affect your emotions.
```

**User's Latest Message**: "Sounds pretty simple, but is this useful? What happens after I write it down?"

**Branch B Output** (Round 2):

```json
{
  "assessment": {
    "identified_questions": ["Is this useful", "What happens after I write it down"],
    "understanding_level": 40,
    "expressed_understanding": false,
    "emotional_state": "Confused",
    "emotion_intensity": 3,
    "topic_alignment": 1.0,
    "resistance_score": 5,
    "cognitive_readiness": 7,
    "has_questions": true,
    "acceptance_level": 30,
    "expressed_willingness": false,
    "reasoning": "User understood the tool's operation method ('sounds pretty simple'), but holds skeptical attitude toward the tool's value ('is this useful'), resistance level dropped from 6 to 5, acceptance level rose to 30 points"
  },
  "assessment_summary": [
    "Acceptance level: 30 points",
    "Resistance level: 5 points",
    "Expressed willingness to try: No",
    "Still has major concerns: Yes"
  ],
  "progress_summary": "User understood the tool's simplicity, but holds skeptical attitude toward the tool's practical value",
  "strategy_steps": {
    "planned_steps": [
      "Step 1: Introduce tool's simplicity and practicality, reduce user's resistance",
      "Step 2: Use concrete examples to show tool's ease of use and practical effects",
      "Step 3: Invite user to try one thought record, lower commitment threshold"
    ],
    "current_step_index": 2,
    "total_steps": 3,
    "step_description": "Show tool's practical value, use concrete examples to explain changes after recording",
    "next_step_focus": "Invite user to try once, lower commitment cost"
  },
  "current_step_completion": {
    "is_completed": true,
    "completion_percentage": 60,
    "reasoning": "Step 1 (explaining tool simplicity) is basically complete, step 2 is in progress, user has started focusing on tool value"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "Current pacing and step order are reasonable, can continue proceeding with original plan"
  },
  "strategy_prompt": "[Communication Strategy]\n- Language style: Use 'you'll find', 'many people say' to increase credibility (matching user's direct and concise style)\n- Example selection: Use a concrete change example (after recording, found thoughts unreasonable, emotion improved), matching user's practical learning style\n- Rapport building: Understand user's skepticism, use 'I understand your question' to build rapport\n- Guidance strategy: Lower commitment cost, invite 'try once' rather than 'keep doing it' (addressing user's fear of trouble)"
}
```

### Simulated LLM Output (Mainline A - Round 2)

```json
{
  "response": {
    "Counselor": "I understand your question. The benefit of writing it down is that you'll find many times your thoughts are actually not quite reasonable. For example, you were late, you thought 'the boss is definitely going to scold me', but after writing it down you might find that the boss actually didn't scold you, or just reminded you. At that point you'll realize it was your own thoughts making you nervous, not the thing itself. Many people say after recording a few times, they can more quickly discover their unreasonable thoughts, and their emotions get better too. Want to try once? Just once, see if it's useful."
  },
  "exit": false,
  "exit_reason": "User acceptance level is 30 points, hasn't reached 70 point threshold, resistance level is 5 points (moderate), need to continue persuading",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**Rule Engine Judgment**:

```typescript
// Client response assessment
const assessment = {
  acceptance_level: 30,
  resistance_score: 5,
  expressed_willingness: false,
  rounds: 2,
};

// Branch B's step adjustment recommendation
const stepAdjustment = {
  should_adjust: false,
  adjustment_type: 'none',
  reasoning:
    'Current pacing and step order are reasonable, can continue proceeding with original plan',
};

// Current step plan (from Branch B's strategy_steps)
let currentPlan = {
  planned_steps: [
    "Step 1: Introduce tool's simplicity and practicality, reduce user's resistance",
    "Step 2: Use concrete examples to show tool's ease of use and practical effects",
    'Step 3: Invite user to try one thought record, lower commitment threshold',
  ],
  current_step_index: 2,
  total_steps: 3,
  step_description:
    "Show tool's practical value, use concrete examples to explain changes after recording",
  next_step_focus: 'Invite user to try once, lower commitment cost',
};

// Rule engine applies step adjustment recommendation
if (stepAdjustment.should_adjust) {
  currentPlan = applyStepAdjustment(currentPlan, stepAdjustment);
  // For example: insert "motivation stimulation" step before current step, or skip subsequent steps
}
// In this round's example should_adjust = false, so keep original step plan

// Execute exit rules
// Rule 1: acceptance_level >= 70 AND expressed_willingness == true → Not met (30 < 70)
// Rule 2: resistance_score >= 8 AND rounds >= 3 → Not met (5 < 8)
// Result: continue
```

---

### Simulated Context (Round 3 Dialogue)

**Dialogue History**:

```
Dr. Wang: Xiao Hong, we talked about the ABC model last time, you understood it very well. Today I'd like to introduce a tool that can help you better understand your thoughts.

Xiao Hong: What tool? Won't it be too troublesome?

Dr. Wang: Not troublesome at all! It's just a very simple form called a thought record. You only need to answer three questions: What happened? What did you think at the time? What did you feel? That's it, one minute to fill out. For example, you were late today (event), you thought 'the boss is definitely going to scold me' (thought), and then you were very nervous (feeling). Just write it down. This tool can help you see clearly how your thoughts affect your emotions.

Xiao Hong: Sounds pretty simple, but is this useful? What happens after I write it down?

Dr. Wang: I understand your question. The benefit of writing it down is that you'll find many times your thoughts are actually not quite reasonable. For example, you were late, you thought 'the boss is definitely going to scold me', but after writing it down you might find that the boss actually didn't scold you, or just reminded you. At that point you'll realize it was your own thoughts making you nervous, not the thing itself. Many people say after recording a few times, they can more quickly discover their unreasonable thoughts, and their emotions get better too. Want to try once? Just once, see if it's useful.
```

**User's Latest Message**: "Okay, I'll try it. It's not troublesome anyway."

**Branch B Output** (Round 3):

```json
{
  "assessment": {
    "identified_questions": [],
    "understanding_level": 75,
    "expressed_understanding": true,
    "emotional_state": "Calm",
    "emotion_intensity": 2,
    "topic_alignment": 1.0,
    "resistance_score": 2,
    "cognitive_readiness": 8,
    "has_questions": false,
    "acceptance_level": 75,
    "expressed_willingness": true,
    "reasoning": "User accepted the suggestion to try ('I'll try it'), although still has some reservation ('It's not troublesome anyway'), but has clearly expressed willingness to try, resistance level dropped to 2 points, acceptance level reached 75 points"
  },
  "progress_summary": "User has accepted the suggestion to try thought record form, persuasion successful",
  "strategy_steps": {
    "planned_steps": [
      "Step 1: Introduce tool's simplicity and practicality, reduce user's resistance",
      "Step 2: Use concrete examples to show tool's ease of use and practical effects",
      "Step 3: Invite user to try one thought record, lower commitment threshold"
    ],
    "current_step_index": 3,
    "total_steps": 3,
    "step_description": "Confirm user's commitment, provide specific action guidance",
    "next_step_focus": "Give simple operation guidance, lower execution difficulty"
  },
  "current_step_completion": {
    "is_completed": true,
    "completion_percentage": 100,
    "reasoning": "Three-step persuasion process completed, user has clearly expressed willingness to try"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "Exit conditions reached, no need to adjust step plan"
  },
  "strategy_prompt": "[Communication Strategy]\n- Language style: Affirm user's decision (user likes to be validated), use 'Great' to reinforce\n- Example selection: No new examples needed, directly give operation guidance\n- Rapport building: Acknowledge user's open attitude\n- Guidance strategy: Give simple first step action guidance (matching user's practical learning style), lower execution difficulty"
}
```

### Simulated LLM Output (Mainline A - Round 3)

```json
{
  "response": {
    "Counselor": "Great! You're willing to try, that's a big step forward. Here's what we'll do: today when you go back, if you encounter something that makes your emotions fluctuate, just use your phone memo to write down: 1) What happened? 2) What did you think at the time? 3) What did you feel? Just these three questions. Next time we meet, you can show me, and we'll analyze it together. What do you think?"
  },
  "exit": true,
  "exit_reason": "User acceptance level is 75 points, reached exit threshold of 70 points, and clearly expressed willingness to try ('I'll try it'), persuasion successful",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**Rule Engine Judgment**:

```typescript
// Client response assessment
const assessment = {
  acceptance_level: 75,
  resistance_score: 2,
  expressed_willingness: true,
  rounds: 3,
};

// Execute exit rules
// Rule 1: acceptance_level >= 70 AND expressed_willingness == true → Met! (75 >= 70 and expressed_willingness = true)
// Result: exit

// Mainline A's LLM judgment as fallback, result consistent: exit = true
```

**System Final Decision**: Rule engine judges exit, Mainline A LLM also judges exit, persuasion successful, end current topic.

---

## 📊 Summary

### Comparison of Two Scenarios

| Dimension                | Scenario 1: Introducing ABC Model                       | Scenario 2: Persuading to Try Thought Record            |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| **Goal**                 | Knowledge transfer                                      | Behavior change (persuasion)                            |
| **User Characteristics** | Strong logical thinking, high learning willingness      | Concrete thinking, prone to resistance                  |
| **Main Challenge**       | Ensure depth of understanding                           | Reduce resistance, build trust                          |
| **Strategy Focus**       | Use examples to deepen understanding, guide application | Emphasize simplicity, show value, lower commitment cost |
| **Exit Standard**        | Understanding level >= 80                               | Acceptance level >= 70                                  |
| **Key Indicators**       | understanding_level                                     | resistance_score, acceptance_level                      |

### Three Lines Collaborative Work

1. **Mainline A (Execution Layer - Core Dialogue Engine)**:
   - ✅ **Responsibility**: Execute business logic, generate response, determine exit
   - ✅ **Execution frequency**: Every round, 2 second response (optimized)
   - ✅ **Task count**: 2 tasks (execute business logic + determine exit)
   - ✅ **Output**: `response` + `exit` + `exit_reason` + `risk_screening`
   - ✅ **Characteristics**: Focus on business logic, concentrated attention, concise prompt (~300 tokens)

2. **Branch B (Analysis Layer - Deep Assessment and Strategy Planning)**:
   - ✅ **Responsibility**: Execute assessment dimensions, output structured assessment results, generate communication strategy, and manage step plan
   - ✅ **Execution frequency**: Every 2-3 rounds, 5-10 second response
   - ✅ **Assessment dimensions**: Defined by script (understanding_level, emotional_state, resistance_score, has_questions, etc.)
   - ✅ **Output**: `assessment` + `assessment_summary` + `progress_summary` + `strategy_steps` + `current_step_completion` + `step_adjustment_recommendation` + `strategy_prompt`
   - ✅ **Characteristics**: Deep analysis, output high-quality assessment, exclusive user profile access, intelligent supervision and adjustment of step execution

3. **Branch C (Monitor Layer - Risk Monitoring and Intervention)**:
   - ✅ **Responsibility**: Continuously monitor risk signals, assess risk level, provide intervention recommendations
   - ✅ **Execution frequency**: Every round, low priority, 3-5 second response
   - ✅ **Output**: `risk_signals` + `risk_level` + `risk_assessment` + `intervention_recommendation`
   - ✅ **Characteristics**: Independent operation, doesn't block Mainline A

4. **Rule Engine (Framework Layer - Deterministic Judgment)**:
   - ✅ **Responsibility**: Client response assessment, execute script-defined exit rules
   - ✅ **Execution frequency**: Every round, millisecond response
   - ✅ **Characteristics**: Deterministic judgment, zero cost, Mainline A's LLM judgment as fallback

### Two-Layer Variable Substitution System

1. **Script Layer Variables** `{variable_name}`:
   - Provided by ActionContext
   - For example: `{user_message}`, `{chat}`, `{task}`

2. **System Layer Variables** `{%variable_name%}`:
   - Provided by system configuration
   - For example: `{%time%}`, `{%who%}`, `{%user%}`, `{%education_background%}`, `{%strategy_prompt%}`

---
