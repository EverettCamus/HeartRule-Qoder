/**
 * YamlService - YAML处理服务
 *
 * 功能：
 * 1. parseYamlToScript - 解析YAML内容为脚本结构
 * 2. syncPhasesToYaml - 将Phases同步回YAML格式
 * 3. fixYamlIndentation - 智能修复YAML缩进错误
 * 4. formatYaml - 格式化YAML内容
 */

import yaml from 'js-yaml';

import type { ScriptFile } from '../api/projects';
import type { Action, SessionScript, Step } from '../types/action';

/**
 * Topic包含Actions的结构
 */
export interface TopicWithActions {
  topic_id: string;
  topic_name?: string;
  description?: string;
  localVariables?: Array<{ name: string; type?: string; description?: string }>;
  actions: Action[];
}

/**
 * Phase包含Topics的结构
 */
export interface PhaseWithTopics {
  phase_id: string;
  phase_name?: string;
  description?: string;
  topics: TopicWithActions[];
}

/**
 * YAML解析结果
 */
export interface ParseResult {
  parsedScript: SessionScript | null;
  phases: PhaseWithTopics[];
  success: boolean;
  error?: string;
}

/**
 * YAML同步参数
 */
export interface SyncToYamlParams {
  phases: PhaseWithTopics[];
  baseScript: any;
  baseYaml?: string;
  targetFile?: ScriptFile;
}

/**
 * YAML同步结果
 */
export interface SyncToYamlResult {
  yaml: string;
  script: any;
  success: boolean;
  error?: string;
}

/**
 * YAML格式化选项
 */
export interface FormatOptions {
  indent?: number;
  lineWidth?: number;
  noRefs?: boolean;
  sortKeys?: boolean;
  quotingType?: '"' | "'";
  forceQuotes?: boolean;
}

class YamlService {
  /**
   * 解析YAML内容为脚本结构
   * 支持新格式(session.phases)和旧格式(sessions.stages.steps)
   */
  parseYamlToScript(yamlContent: string): ParseResult {
    try {
      const parsed = yaml.load(yamlContent) as any;
      const phases: PhaseWithTopics[] = [];

      console.log('解析的完整脚本:', parsed);

      // 新格式：session.phases[].topics[].actions[]
      if (parsed?.session?.phases) {
        console.log('检测到新格式脚本 (session.phases)');

        parsed.session.phases.forEach((phase: any) => {
          const topics: TopicWithActions[] = [];

          phase.topics?.forEach((topic: any) => {
            const actions: Action[] = [];

            topic.actions?.forEach((action: any) => {
              // 规范化 Action 类型，将 config 字段映射到前端期望的字段名
              if (action.action_type === 'ai_say') {
                // 优先使用 content，然后回退到 content_template（向后兼容）
                const contentValue =
                  action.config?.content || action.config?.content_template || '';
                actions.push({
                  type: 'ai_say',
                  content: contentValue, // 新字段
                  ai_say: contentValue, // 旧字段，保持向后兼容
                  tone: action.config?.tone,
                  exit: action.config?.exit,
                  condition: action.condition,
                  max_rounds: action.config?.max_rounds,
                  action_id: action.action_id,
                  _raw: action, // 保留原始数据用于反向转换
                });
              } else if (action.action_type === 'ai_ask') {
                // 优先使用 content，然后回退到 question_template 或 content_template
                const contentValue =
                  action.config?.content ||
                  action.config?.question_template ||
                  action.config?.content_template ||
                  '';
                actions.push({
                  type: 'ai_ask',
                  ai_ask: contentValue,
                  tone: action.config?.tone,
                  exit: action.config?.exit,
                  max_rounds: action.config?.max_rounds,
                  output: action.config?.output || [],
                  condition: action.condition,
                  action_id: action.action_id,
                  _raw: action,
                });
              } else if (action.action_type === 'ai_think') {
                // 优先使用 content，然后回退到 prompt_template
                const contentValue =
                  action.config?.content ||
                  action.config?.prompt_template ||
                  action.config?.think_goal ||
                  '';
                actions.push({
                  type: 'ai_think',
                  think: contentValue,
                  output: action.config?.output || [],
                  condition: action.condition,
                  action_id: action.action_id,
                  _raw: action,
                });
              } else if (action.action_type === 'use_skill') {
                actions.push({
                  type: 'use_skill',
                  skill: action.config?.skill || '',
                  input: action.config?.input || [],
                  output: action.config?.output || [],
                  condition: action.condition,
                  action_id: action.action_id,
                  _raw: action,
                });
              } else if (action.ai_say) {
                // 兼容旧的直接字段格式
                actions.push({ type: 'ai_say', ...action });
              } else if (action.ai_ask) {
                actions.push({ type: 'ai_ask', ...action });
              } else if (action.think) {
                actions.push({ type: 'ai_think', ...action });
              } else {
                actions.push(action);
              }
            });

            topics.push({
              topic_id: topic.topic_id,
              topic_name: topic.topic_name,
              description: topic.description,
              localVariables: topic.declare || [],
              actions,
            });
          });

          phases.push({
            phase_id: phase.phase_id,
            phase_name: phase.phase_name,
            description: phase.description,
            topics,
          });
        });
      }
      // 旧格式：sessions[].stages[].steps[].actions[] - 将其转换为单一 Phase/Topic
      else if (parsed?.sessions?.[0]?.stages?.[0]?.steps) {
        console.log('检测到旧格式脚本 (sessions.stages.steps)');
        const firstStepWithActions = parsed.sessions[0].stages[0].steps.find(
          (step: Step) => step.actions && step.actions.length > 0
        );

        if (firstStepWithActions?.actions) {
          const actions: Action[] = [];
          firstStepWithActions.actions.forEach((action: any) => {
            if (action.ai_say) actions.push({ type: 'ai_say', ...action });
            else if (action.ai_ask) actions.push({ type: 'ai_ask', ...action });
            else if (action.think) actions.push({ type: 'ai_think', ...action });
            else if (action.say) actions.push({ type: 'say', ...action });
            else if (action.user_say) actions.push({ type: 'user_say', ...action });
            else actions.push(action);
          });

          // 将旧格式转换为单一 Phase 和 Topic
          phases.push({
            phase_id: 'legacy_phase',
            phase_name: '会谈阶段',
            topics: [
              {
                topic_id: 'legacy_topic',
                topic_name: '会谈主题',
                actions,
              },
            ],
          });
        }
      }

      const totalActions = phases.reduce(
        (sum, p) => sum + p.topics.reduce((s, t) => s + t.actions.length, 0),
        0
      );
      console.log(`提取到的层级结构: ${phases.length} Phases, 总计 ${totalActions} Actions`);

      return {
        parsedScript: parsed,
        phases,
        success: true,
      };
    } catch (error) {
      console.error('YAML 解析失败:', error);
      return {
        parsedScript: null,
        phases: [],
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 将Phases同步回YAML格式
   * 保留原有metadata，支持新旧格式转换
   */
  syncPhasesToYaml(params: SyncToYamlParams): SyncToYamlResult {
    const { phases, baseScript, baseYaml, targetFile } = params;

    console.log('[syncPhasesToYaml] 开始执行');
    console.log('[syncPhasesToYaml] 输入 phases 数量:', phases.length);

    try {
      let updatedScript: any;

      // 优先级: baseScript > 解析baseYaml > 创建新结构
      if (baseScript) {
        updatedScript = JSON.parse(JSON.stringify(baseScript));
        console.log('[syncPhasesToYaml] 使用 baseScript');
      } else if (baseYaml) {
        try {
          updatedScript = yaml.load(baseYaml) as any;
          console.log('[syncPhasesToYaml] 从 baseYaml 解析脚本');
        } catch (e) {
          console.error('[syncPhasesToYaml] baseYaml 解析失败:', e);
          updatedScript = null;
        }
      }

      // 如果都没有，创建新的脚本结构
      if (!updatedScript) {
        console.log('[syncPhasesToYaml] 没有可用基线，创建新的脚本结构');
        updatedScript = {
          session: {
            session_id: targetFile?.fileName?.replace('.yaml', '') || 'new-session',
            session_name: targetFile?.fileName?.replace('.yaml', '') || 'New Session',
            phases: [],
          },
        };
      }

      // 确保 updatedScript 有 session 结构
      if (!updatedScript.session) {
        console.log('[syncPhasesToYaml] 脚本中没有 session 结构，创建新的 session');
        updatedScript.session = {
          session_id: targetFile?.fileName?.replace('.yaml', '') || 'new-session',
          session_name: targetFile?.fileName?.replace('.yaml', '') || 'New Session',
          phases: [],
        };
      }

      // 新格式：更新 session.phases
      if (updatedScript?.session) {
        console.log('[syncPhasesToYaml] 检测到 session 结构');
        // 确保 session.phases 存在
        if (!updatedScript.session.phases) {
          updatedScript.session.phases = [];
          console.log('[syncPhasesToYaml] 初始化 session.phases 数组');
        }

        console.log('[syncPhasesToYaml] 开始构建 phases 数据...');
        // 重建 phases 结构，保持其他字段不变
        updatedScript.session.phases = phases.map((phase, pi) => {
          const originalPhase = baseScript?.session?.phases?.[pi] || {};
          return {
            ...originalPhase,
            phase_id: phase.phase_id,
            phase_name: phase.phase_name,
            description: phase.description,
            topics: phase.topics.map((topic, ti) => {
              const originalTopic = originalPhase.topics?.[ti] || {};
              const topicResult: any = {
                ...originalTopic,
                topic_id: topic.topic_id,
                topic_name: topic.topic_name,
                description: topic.description,
                actions: topic.actions.map((action) => {
                  // 将前端字段映射回 config 格式（符合最新 Schema 规范）
                  if (action._raw) {
                    // 使用保留的原始数据
                    const rawAction = action._raw as any;
                    if (action.type === 'ai_say') {
                      // ai_say: 使用 content 字段（不是 content_template）
                      const contentValue = action.content || action.ai_say || '';
                      const config: any = {};

                      // 必填字段
                      if (contentValue) {
                        config.content = contentValue;
                      }

                      // 只包含非空字段
                      if (action.tone) config.tone = action.tone;
                      if (action.exit) config.exit = action.exit;
                      if (action.max_rounds) config.max_rounds = action.max_rounds;

                      const result: any = {
                        action_type: 'ai_say',
                        action_id: rawAction.action_id || action.id,
                        config,
                      };

                      if (action.condition) result.condition = action.condition;
                      return result;
                    } else if (action.type === 'ai_ask') {
                      // ai_ask: 使用 content 字段（不是 question_template）
                      // 移除废弃字段: tolist, target_variable, extraction_prompt, required
                      const config: any = {};

                      // 必填字段
                      if (action.ai_ask) {
                        config.content = action.ai_ask;
                      }

                      // 只包含非空字段
                      if (action.tone) config.tone = action.tone;
                      if (action.exit) config.exit = action.exit;
                      if (action.max_rounds) config.max_rounds = action.max_rounds;

                      // 只在有输出变量时才包含 output 数组
                      if (action.output && action.output.length > 0) {
                        config.output = action.output;
                      }

                      const result: any = {
                        action_type: 'ai_ask',
                        action_id: rawAction.action_id || action.id,
                        config,
                      };

                      if (action.condition) result.condition = action.condition;
                      return result;
                    } else if (action.type === 'ai_think') {
                      // ai_think: 使用 content 字段（不是 prompt_template）
                      const config: any = {};

                      // 必填字段
                      if (action.think) {
                        config.content = action.think;
                      }

                      // 使用 output 数组（不是 output_variables）
                      if (action.output && action.output.length > 0) {
                        config.output = action.output;
                      }

                      const result: any = {
                        action_type: 'ai_think',
                        action_id: rawAction.action_id || action.id,
                        config,
                      };

                      if (action.condition) result.condition = action.condition;
                      return result;
                    } else if (action.type === 'use_skill') {
                      // use_skill: 使用 skill, input, output 字段
                      const config: any = {};

                      // 必填字段
                      if (action.skill) {
                        config.skill = action.skill;
                      }

                      if (action.input && action.input.length > 0) {
                        config.input = action.input;
                      }

                      if (action.output && action.output.length > 0) {
                        config.output = action.output;
                      }

                      const result: any = {
                        action_type: 'use_skill',
                        action_id: rawAction.action_id || action.id,
                        config,
                      };

                      if (action.condition) result.condition = action.condition;
                      return result;
                    }
                    return rawAction;
                  }
                  return action;
                }),
              };

              // 只在 declare 非空时才添加
              if (topic.localVariables && topic.localVariables.length > 0) {
                topicResult.declare = topic.localVariables;
              }

              return topicResult;
            }),
          };
        });
        console.log(
          '[syncPhasesToYaml] phases 数据构建完成，数量:',
          updatedScript.session.phases.length
        );
      }
      // 旧格式：更新 sessions[].stages[].steps[].actions[]
      else if (updatedScript.sessions?.[0]?.stages?.[0]?.steps) {
        console.log('[syncPhasesToYaml] 检测到旧格式');
        const stepIndex = updatedScript.sessions[0].stages[0].steps.findIndex(
          (step: Step) => step.actions && step.actions.length > 0
        );

        if (stepIndex !== -1 && phases[0]?.topics[0]?.actions) {
          updatedScript.sessions[0].stages[0].steps[stepIndex].actions =
            phases[0].topics[0].actions;
        }
      }

      console.log('[syncPhasesToYaml] 开始转换为 YAML...');
      // 转换回 YAML
      const newYaml = yaml.dump(updatedScript, {
        lineWidth: -1,
        noRefs: true,
      });
      console.log('[syncPhasesToYaml] YAML 转换完成，长度:', newYaml.length);
      console.log('[syncPhasesToYaml] YAML 内容预览:', newYaml.substring(0, 200));

      return {
        yaml: newYaml,
        script: updatedScript,
        success: true,
      };
    } catch (error) {
      console.error('同步到 YAML 失败:', error);
      return {
        yaml: '',
        script: null,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 智能修复YAML缩进错误
   * 特别针对Action字段和config子字段
   */
  fixYamlIndentation(yamlContent: string): string {
    const lines = yamlContent.split('\n');
    const fixedLines: string[] = [];
    let lastListItemIndent: number | null = null;
    let lastKeyIndent: number | null = null;
    let inListItem = false; // 追踪是否在列表项内部

    console.log('[FixIndent] 开始修复 YAML 缩进...');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trimStart();

      // 空行或注释直接保留
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        fixedLines.push(line);
        continue;
      }

      // 计算当前行的缩进
      const currentIndent = line.length - trimmedLine.length;

      // 检测是否是列表项（以 - 开头）
      const isListItem = /^-\s+\w+:/.test(trimmedLine);

      // 检测是否是键值对（包含冒号）
      const keyMatch = trimmedLine.match(/^([\w_]+):\s*(.*)$/);
      const isKeyValue = keyMatch !== null;

      // 检测是否是纯列表项标记（只有 -）
      const isPureListMarker = /^-\s*$/.test(trimmedLine);

      console.log(
        `[FixIndent] 第${i + 1}行: "${trimmedLine.substring(0, 30)}..." | 缩进=${currentIndent}, inListItem=${inListItem}, lastListItemIndent=${lastListItemIndent}`
      );

      if (isListItem) {
        // 记录列表项的缩进
        lastListItemIndent = currentIndent;
        lastKeyIndent = null;
        inListItem = true;
        console.log(`[FixIndent] → 检测到列表项，设置 lastListItemIndent=${currentIndent}`);
        fixedLines.push(line);
        continue;
      }

      if (isPureListMarker) {
        lastListItemIndent = currentIndent;
        lastKeyIndent = null;
        inListItem = true;
        console.log(`[FixIndent] → 检测到纯列表标记`);
        fixedLines.push(line);
        continue;
      }

      // 【优先检查】：如果在列表项内部，且当前行是 Action 字段，检查缩进是否正确
      if (inListItem && lastListItemIndent !== null && isKeyValue && keyMatch) {
        const actionFields = ['action_type', 'action_id', 'config', 'condition'];
        const key = keyMatch[1];

        if (actionFields.includes(key)) {
          // 这是 Action 的字段，应该缩进 = 列表项缩进 + 2
          const correctIndent = lastListItemIndent + 2;

          if (currentIndent !== correctIndent) {
            console.log(
              `[FixIndent] → 修复 Action 字段 "${key}" 缩进: ${currentIndent} -> ${correctIndent}`
            );
            fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
            lastKeyIndent = correctIndent;
            continue;
          }
        }
      }

      // 检测是否退出了列表项（缩进小于或等于列表项缩进）
      if (
        inListItem &&
        lastListItemIndent !== null &&
        currentIndent <= lastListItemIndent &&
        !isListItem &&
        !isPureListMarker
      ) {
        // 非 Action 字段才真正退出列表项
        const actionFields = ['action_type', 'action_id', 'config', 'condition'];
        const key = keyMatch?.[1];

        if (!key || !actionFields.includes(key)) {
          // 真的退出了列表项
          console.log(`[FixIndent] → 退出列表项（字段: ${key || 'unknown'}）`);
          inListItem = false;
          lastListItemIndent = null;
        }
      }

      if (isKeyValue && keyMatch) {
        const key = keyMatch[1];

        // 规则1：修复列表项内的第一个字段后续字段
        if (lastListItemIndent !== null && i > 0) {
          const prevLine = lines[i - 1].trimStart();
          const prevIsListItem = /^-\s+\w+:/.test(prevLine);

          if (prevIsListItem) {
            // 前一行是列表项（如 "- action_id: xxx"）
            // 当前行应该缩进 = 列表项缩进 + 2
            const correctIndent = lastListItemIndent + 2;

            if (currentIndent !== correctIndent) {
              console.log(
                `[FixIndent] 修复列表项后的字段 "${key}" 的缩进: ${currentIndent} -> ${correctIndent}`
              );
              fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
              lastKeyIndent = correctIndent;
              continue;
            }
          } else if (lastKeyIndent !== null && !prevLine.startsWith('-')) {
            // 前一行是普通字段（不是列表项）
            const prevKeyMatch = prevLine.match(/^([\w_]+):/);
            if (prevKeyMatch && prevKeyMatch[1]) {
              const prevIndent = lines[i - 1].length - lines[i - 1].trimStart().length;

              // 检查是否应该是子字段（如 config 的子字段）
              const prevKey = prevKeyMatch[1];
              const configSubFields = [
                'content',
                'tone',
                'exit',
                'max_rounds',
                'output',
                'skill',
                'input',
              ];
              const isSubField = prevKey === 'config' && configSubFields.includes(key);

              if (isSubField) {
                // 应该是子字段，缩进 = 父字段缩进 + 2
                const correctIndent = prevIndent + 2;
                if (currentIndent !== correctIndent) {
                  console.log(
                    `[FixIndent] 修复子字段 "${key}" 的缩进: ${currentIndent} -> ${correctIndent}`
                  );
                  fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
                  lastKeyIndent = correctIndent;
                  continue;
                }
              } else if (currentIndent < prevIndent) {
                // 缩进减少，可能是返回到上一级
                fixedLines.push(line);
                lastKeyIndent = currentIndent;
                // 检查是否退出了列表项的范围
                if (currentIndent <= lastListItemIndent) {
                  inListItem = false;
                  lastListItemIndent = null;
                }
                continue;
              } else if (
                inListItem &&
                currentIndent !== prevIndent &&
                currentIndent !== prevIndent + 2
              ) {
                // 在列表项内，同级字段应该对齐
                console.log(
                  `[FixIndent] 修复同级字段 "${key}" 的缩进: ${currentIndent} -> ${prevIndent}`
                );
                fixedLines.push(' '.repeat(prevIndent) + trimmedLine);
                lastKeyIndent = prevIndent;
                continue;
              }
            }
          }
        }

        // 规则2：修复 config 子字段
        const configSubFields = [
          'content',
          'tone',
          'exit',
          'max_rounds',
          'output',
          'skill',
          'input',
        ];

        if (configSubFields.includes(key) && i > 0) {
          const prevLine = lines[i - 1].trimStart();
          if (prevLine.startsWith('config:')) {
            const prevIndent = lines[i - 1].length - lines[i - 1].trimStart().length;
            const correctIndent = prevIndent + 2;

            if (currentIndent !== correctIndent) {
              console.log(
                `[FixIndent] 修复 config 子字段 "${key}" 的缩进: ${currentIndent} -> ${correctIndent}`
              );
              fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
              lastKeyIndent = correctIndent;
              continue;
            }
          }
        }

        // 规则3：修复 config 字段本身
        if (key === 'config' && lastListItemIndent !== null) {
          const correctIndent = lastListItemIndent + 2;
          if (currentIndent !== correctIndent) {
            console.log(`[FixIndent] 修复 config 字段的缩进: ${currentIndent} -> ${correctIndent}`);
            fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
            lastKeyIndent = correctIndent;
            continue;
          }
        }

        // 更新 lastKeyIndent
        lastKeyIndent = currentIndent;
      }

      // 如果没有修复，保留原行
      fixedLines.push(line);
    }

    return fixedLines.join('\n');
  }

  /**
   * 格式化YAML内容
   * 支持智能缩进修复
   */
  formatYaml(
    yamlContent: string,
    options?: FormatOptions
  ): {
    formatted: string;
    success: boolean;
    error?: string;
    autoFixed?: boolean;
  } {
    const defaultOptions: FormatOptions = {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
      let contentToFormat = yamlContent;
      let autoFixed = false;

      // 第一步：尝试智能修复缩进错误
      try {
        yaml.load(yamlContent);
        console.log('[FormatYAML] YAML 语法正确，直接格式化');
      } catch (parseError) {
        console.log('[FormatYAML] YAML 解析失败，尝试智能修复缩进...', parseError);
        contentToFormat = this.fixYamlIndentation(yamlContent);

        // 验证修复后是否可以解析
        try {
          yaml.load(contentToFormat);
          autoFixed = true;
          console.log('[FormatYAML] 缩进修复成功');
        } catch (fixError) {
          console.error('[FormatYAML] 缩进修复失败:', fixError);
          throw new Error(
            `无法自动修复 YAML 语法错误，请手动检查：${fixError instanceof Error ? fixError.message : '未知错误'}`
          );
        }
      }

      // 第二步：解析并重新格式化
      const parsedYaml = yaml.load(contentToFormat);

      const formattedYaml = yaml.dump(parsedYaml, {
        indent: finalOptions.indent,
        lineWidth: finalOptions.lineWidth,
        noRefs: finalOptions.noRefs,
        sortKeys: finalOptions.sortKeys,
        quotingType: finalOptions.quotingType,
        forceQuotes: finalOptions.forceQuotes,
      });

      console.log('[FormatYAML] 格式化完成');
      return {
        formatted: formattedYaml,
        success: true,
        autoFixed,
      };
    } catch (error) {
      console.error('[FormatYAML] 格式化失败:', error);
      return {
        formatted: yamlContent,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }
}

// 导出单例
export const yamlService = new YamlService();
export default yamlService;
