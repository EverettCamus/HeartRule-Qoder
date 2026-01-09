import { z } from 'zod';
import type { LLMOrchestrator } from '../llm-orchestration/orchestrator.js';

/**
 * 变量配置
 */
export interface VariableConfig {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'list' | 'object';
  extractionMethod: 'direct' | 'pattern' | 'llm';
  pattern?: string;
  description?: string;
  schema?: z.ZodType;
}

/**
 * 变量提取引擎
 * 
 * 支持多种提取方法：
 * - direct: 直接提取用户输入
 * - pattern: 正则表达式匹配
 * - llm: 使用LLM进行智能提取
 */
export class VariableExtractor {
  private llmOrchestrator?: LLMOrchestrator;

  constructor(llmOrchestrator?: LLMOrchestrator) {
    this.llmOrchestrator = llmOrchestrator;
  }

  /**
   * 从用户输入中提取变量
   */
  async extract(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>,
    variableConfigs: VariableConfig[]
  ): Promise<Record<string, unknown>> {
    const extracted: Record<string, unknown> = {};

    for (const config of variableConfigs) {
      let value: unknown;

      switch (config.extractionMethod) {
        case 'direct':
          value = this.extractDirect(userInput, config.type);
          break;
        case 'pattern':
          if (config.pattern) {
            value = this.extractPattern(userInput, config.pattern, config.type);
          }
          break;
        case 'llm':
          if (this.llmOrchestrator) {
            value = await this.extractLLM(userInput, conversationHistory, config);
          }
          break;
      }

      if (value !== undefined && value !== null) {
        // 使用Zod Schema验证（如果提供）
        if (config.schema) {
          try {
            value = config.schema.parse(value);
          } catch (error) {
            console.warn(`Variable ${config.name} validation failed:`, error);
            continue;
          }
        }

        extracted[config.name] = value;
      }
    }

    return extracted;
  }

  /**
   * 直接提取（用户输入即为值）
   */
  private extractDirect(userInput: string, type: VariableConfig['type']): unknown {
    const trimmed = userInput.trim();

    switch (type) {
      case 'text':
        return trimmed;

      case 'number': {
        // 提取数字
        const numbers = trimmed.match(/-?\d+\.?\d*/);
        return numbers ? parseFloat(numbers[0]) : undefined;
      }

      case 'boolean': {
        // 判断是否为肯定回答
        const positive = ['是', '对', '嗯', 'yes', 'yeah', 'ok', '好', '确实', '对的'];
        const negative = ['不', '否', '没有', 'no', 'nope', '不是'];
        const lower = trimmed.toLowerCase();

        if (positive.some((word) => lower.includes(word))) return true;
        if (negative.some((word) => lower.includes(word))) return false;
        return undefined;
      }

      case 'list': {
        // 按逗号、顿号、分号分割
        const items = trimmed.split(/[,，、;；]/);
        return items.map((item) => item.trim()).filter((item) => item.length > 0);
      }

      case 'object':
        // 尝试解析JSON
        try {
          return JSON.parse(trimmed);
        } catch {
          return undefined;
        }

      default:
        return trimmed;
    }
  }

  /**
   * 正则表达式提取
   */
  private extractPattern(
    userInput: string,
    pattern: string,
    type: VariableConfig['type']
  ): unknown {
    try {
      const regex = new RegExp(pattern);
      const match = regex.exec(userInput);

      if (!match) return undefined;

      // 获取第一个捕获组或整个匹配
      const value = match[1] || match[0];

      return this.convertType(value, type);
    } catch (error) {
      console.warn('Pattern extraction failed:', error);
      return undefined;
    }
  }

  /**
   * 使用LLM进行智能提取
   */
  private async extractLLM(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>,
    config: VariableConfig
  ): Promise<unknown> {
    if (!this.llmOrchestrator) {
      console.warn('LLM orchestrator not available for variable extraction');
      return undefined;
    }

    try {
      // 构建提取提示词
      const prompt = this.buildExtractionPrompt(userInput, conversationHistory, config);

      // TODO: 使用streamObject进行结构化提取
      // 当前返回简化实现
      const response = await this.llmOrchestrator.generateText(prompt);

      // 尝试解析LLM响应
      return this.parseExtractionResponse(response, config.type);
    } catch (error) {
      console.warn(`LLM extraction failed for ${config.name}:`, error);
      return undefined;
    }
  }

  /**
   * 构建变量提取提示词
   */
  private buildExtractionPrompt(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>,
    config: VariableConfig
  ): string {
    let prompt = `请从以下对话中提取变量信息。\n\n`;

    // 添加对话历史（最近3条）
    const recentHistory = conversationHistory.slice(-3);
    if (recentHistory.length > 0) {
      prompt += `对话历史：\n`;
      for (const msg of recentHistory) {
        prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
      }
      prompt += `\n`;
    }

    // 当前用户输入
    prompt += `当前用户输入: ${userInput}\n\n`;

    // 变量说明
    prompt += `需要提取的变量：\n`;
    prompt += `- 名称：${config.name}\n`;
    prompt += `- 类型：${config.type}\n`;
    if (config.description) {
      prompt += `- 说明：${config.description}\n`;
    }

    prompt += `\n请直接返回提取的值，不要添加额外说明。`;

    return prompt;
  }

  /**
   * 获取默认Schema
   * Reserved for future use with streamObject
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getDefaultSchema(config: VariableConfig): z.ZodType {
    switch (config.type) {
      case 'text':
        return z.string();
      case 'number':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'list':
        return z.array(z.string());
      case 'object':
        return z.record(z.unknown());
      default:
        return z.unknown();
    }
  }

  /**
   * 解析LLM提取响应
   */
  private parseExtractionResponse(response: string, type: VariableConfig['type']): unknown {
    const trimmed = response.trim();

    switch (type) {
      case 'number':
        return parseFloat(trimmed);
      case 'boolean':
        return ['true', 'yes', '是', '对'].includes(trimmed.toLowerCase());
      case 'list':
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed.split(',').map((s) => s.trim());
        }
      case 'object':
        try {
          return JSON.parse(trimmed);
        } catch {
          return undefined;
        }
      default:
        return trimmed;
    }
  }

  /**
   * 类型转换
   */
  private convertType(value: string, type: VariableConfig['type']): unknown {
    try {
      switch (type) {
        case 'number':
          return parseFloat(value);
        case 'boolean':
          return ['true', 'yes', '1', '是', '对'].includes(value.toLowerCase());
        case 'list':
          return value.split(',').map((v) => v.trim());
        case 'object':
          return JSON.parse(value);
        default:
          return value;
      }
    } catch {
      return value;
    }
  }

  /**
   * 批量提取多个变量
   */
  async extractMultiple(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>,
    variableConfigs: VariableConfig[]
  ): Promise<Record<string, unknown>> {
    // 分组：LLM提取 vs 非LLM提取
    const llmConfigs = variableConfigs.filter((c) => c.extractionMethod === 'llm');
    const nonLlmConfigs = variableConfigs.filter((c) => c.extractionMethod !== 'llm');

    // 非LLM提取（快速）
    const nonLlmResults: Record<string, unknown> = {};
    for (const config of nonLlmConfigs) {
      const value = await this.extract(userInput, conversationHistory, [config]);
      if (value[config.name] !== undefined) {
        nonLlmResults[config.name] = value[config.name];
      }
    }

    // LLM提取（可能较慢，但可以批量）
    let llmResults: Record<string, unknown> = {};
    if (llmConfigs.length > 0 && this.llmOrchestrator) {
      llmResults = await this.extract(userInput, conversationHistory, llmConfigs);
    }

    return { ...nonLlmResults, ...llmResults };
  }
}
