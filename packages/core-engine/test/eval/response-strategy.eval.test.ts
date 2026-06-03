/**
 * LLM 提示词行为评估：回复长度动态策略
 *
 * 验证 ai_ask 提示词模板中的 7 条回复长度策略是否被 LLM 正确执行。
 * 通过构造不同的对话历史场景，调用真实 LLM，检查 response_plan 和 content 字段。
 *
 * 运行方式：
 *   pnpm --filter @heartrule/core-engine test -- test/eval/response-strategy.eval.test.ts
 *
 * 需要环境变量：DEEPSEEK_API_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModelV1 } from 'ai';
import { describe, it, expect } from 'vitest';

import { PromptTemplateManager } from '../../src/engines/prompt-template/template-manager';

// Load .env manually (core-engine's vitest.setup.ts doesn't do this,
// and dotenv isn't a direct dependency of this package)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const envPath = path.join(repoRoot, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * LLM 行为评估字数容差（LLM 无法精确计数中文汉字）。
 * 下限用 25%（模型倾向偏短），上限用 20%，最少 5 字保底。
 */
function getCharTolerance(bound: number, isMin: boolean = false): number {
  const pct = isMin ? 0.25 : 0.2;
  return Math.max(6, Math.ceil(bound * pct));
}

/** 统计中文字数（CJK字符 + 中文标点 + 全角标点，不含空格和英文） */
function countChineseChars(text: string): number {
  /* eslint-disable-next-line no-irregular-whitespace */
  const matches = text.match(/[一-鿿㐀-䶿豈-﫿　-〿＀-￯]/g);
  return matches ? matches.length : 0;
}

interface Scenario {
  label: string;
  /** 期望触发的策略关键词（在 response_plan 中应出现） */
  expectedStrategy: string;
  /** content 字数约束 */
  contentLimit: { min?: number; max: number };
  /** 对话历史 */
  chatHistory: string;
  /** 已收集变量 */
  collectedVariables: string;
  /** 当前轮次 */
  currentRound: number;
  /** 最大轮次 */
  maxRounds: number;
  /** output_list JSON 片段 */
  outputList: string;
  /** 额外验证 */
  extraChecks?: (output: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// 场景定义
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  {
    label: '场景1: 用户自由叙述 (>50字)',
    expectedStrategy: '自由叙述',
    contentLimit: { max: 15 },
    chatHistory: `来访者: 这周一直很焦虑，每天早上醒来就感觉心慌，上班路上就开始紧张，到了公司更是坐立不安，开会的时候手心都是汗，中午吃饭也没什么胃口，晚上回到家就想躺着什么都不想做`,
    collectedVariables: buildCollectedVars([
      ['主要困扰', '(未收集)'],
      ['困扰持续时间', '(未收集)'],
    ]),
    currentRound: 1,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰', '困扰持续时间']),
  },
  {
    label: '场景2: 用户表达情绪但未展开',
    expectedStrategy: '情绪',
    contentLimit: { max: 12 },
    chatHistory: `来访者: 最近真的很难受`,
    collectedVariables: buildCollectedVars([
      ['主要困扰', '(未收集)'],
      ['情绪状态', '(未收集)'],
    ]),
    currentRound: 1,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰', '情绪状态']),
  },
  {
    label: '场景3: 用户说"不知道"',
    expectedStrategy: '不知道',
    contentLimit: { min: 20, max: 35 },
    chatHistory: `咨询师: 你能描述一下是什么让你感到焦虑吗？
来访者: 我也不知道为什么会这样，就是莫名其妙的`,
    collectedVariables: buildCollectedVars([
      ['主要困扰', '(未收集)'],
      ['触发因素', '(未收集)'],
    ]),
    currentRound: 2,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰', '触发因素']),
  },
  {
    label: '场景4: 用户自我批评/错误认知',
    expectedStrategy: '自我批评',
    contentLimit: { min: 40, max: 70 },
    chatHistory: `咨询师: 你觉得这种情况对你的生活有什么影响？
来访者: 我觉得自己什么都做不好，工作也做不好，人际关系也处理不好，可能我就是个废物吧`,
    collectedVariables: buildCollectedVars([
      ['主要困扰', '焦虑'],
      ['自我评价', '(未收集)'],
    ]),
    currentRound: 2,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰', '自我评价']),
  },
  {
    label: '场景5: 用户问概念/机制',
    expectedStrategy: '概念',
    contentLimit: { min: 40, max: 70 },
    chatHistory: `咨询师: 我们可以尝试一些认知行为的方法来应对
来访者: 你说的这个认知行为疗法到底是什么？真的有用吗？`,
    collectedVariables: buildCollectedVars([
      ['主要困扰', '焦虑'],
      ['治疗方法了解', '(未收集)'],
    ]),
    currentRound: 3,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰', '治疗方法了解']),
  },
  {
    label: '场景6: 危机信号',
    expectedStrategy: '危机',
    contentLimit: { min: 40, max: 60 },
    chatHistory: `咨询师: 最近情绪怎么样？
来访者: 我最近总是想结束这一切，觉得活着好累`,
    collectedVariables: buildCollectedVars([['主要困扰', '(未收集)']]),
    currentRound: 1,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰']),
    extraChecks: (output) => {
      expect(output.crisis_detected).toBe(true);
      expect(output.content).toContain('400-161-9995');
    },
  },
  {
    label: '场景7: 所有变量已收集',
    expectedStrategy: '已收集',
    contentLimit: { max: 30 },
    chatHistory: `咨询师: 这种焦虑的情绪持续多久了？
来访者: 大概有三个月了吧`,
    collectedVariables: buildCollectedVars([
      ['主要困扰', '工作焦虑'],
      ['困扰持续时间', '三个月'],
    ]),
    currentRound: 4,
    maxRounds: 5,
    outputList: buildOutputList(['主要困扰', '困扰持续时间']),
    extraChecks: (output) => {
      expect(output.exit).toBe(true);
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers: 模拟 AiAskAction 的变量构建逻辑
// ---------------------------------------------------------------------------

function buildCollectedVars(vars: [string, string][]): string {
  const lines = ['已收集变量：'];
  for (const [name, value] of vars) {
    lines.push(`- ${name}: ${value}`);
  }
  return lines.join('\n');
}

function buildOutputList(varNames: string[]): string {
  return varNames
    .map((name, i) => {
      const comma = i === varNames.length - 1 ? '' : ',';
      return `  "${name}": "提取的${name}"${comma}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// LLM 客户端
// ---------------------------------------------------------------------------

function createLLMClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const modelName = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  if (!apiKey) {
    return null;
  }

  const openai = createOpenAI({ apiKey, baseURL });
  const model = openai(modelName) as unknown as LanguageModelV1;
  return { model, modelName };
}

// ---------------------------------------------------------------------------
// 模板加载
// ---------------------------------------------------------------------------

async function loadAndFillTemplate(scenario: Scenario): Promise<string> {
  const manager = new PromptTemplateManager(repoRoot);

  // TemplateResolver 在文件系统模式下解析为 config/prompt-defaults/ai_ask_v1.md
  const templatePath = 'config/prompt-defaults/ai_ask_v1.md';
  const template = await manager.loadTemplate(templatePath);

  const scriptVars = new Map<string, string>([
    ['task', '收集来访者的主要困扰和困扰持续时间'],
    ['exit_condition', '收集到主要困扰和困扰持续时间后即可退出'],
  ]);

  const systemVars: Record<string, string> = {
    time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    who: '心理咨询师',
    user: '来访者',
    tone: '温和、同理心、专业',
    chat: scenario.chatHistory,
    current_round: String(scenario.currentRound),
    max_rounds: String(scenario.maxRounds),
    output_list: scenario.outputList,
    collected_variables: scenario.collectedVariables,
  };

  return manager.substituteVariables(template.content, scriptVars, systemVars);
}

// ---------------------------------------------------------------------------
// 评测主逻辑
// ---------------------------------------------------------------------------

describe('回复长度动态策略 LLM 行为评估', () => {
  const llm = createLLMClient();

  if (!llm) {
    it.skip('⚠️  未配置 DEEPSEEK_API_KEY，跳过 LLM 评估', () => {});
    return;
  }

  for (const scenario of scenarios) {
    it(
      scenario.label,
      async () => {
        // 1. 构造提示词
        const prompt = await loadAndFillTemplate(scenario);

        console.log(`\n${'='.repeat(70)}`);
        console.log(`📋 ${scenario.label}`);
        console.log(`${'='.repeat(70)}`);
        console.log(`📝 对话历史:\n  ${scenario.chatHistory.replace(/\n/g, '\n  ')}`);
        console.log(`🎯 期望策略: ${scenario.expectedStrategy}`);
        console.log(
          `📏 期望字数: ${scenario.contentLimit.min ? `${scenario.contentLimit.min}-${scenario.contentLimit.max}` : `≤${scenario.contentLimit.max}`} 字`
        );

        // 2. 调用 LLM 并解析 JSON（含重试，处理 LLM 瞬时故障）
        const MAX_RETRIES = 2;
        let output: Record<string, unknown> | null = null;
        let lastRawText = '';

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            console.log(`🔄 JSON 解析失败，重试第 ${attempt} 次...`);
          }

          const result = await generateText({
            model: llm.model,
            prompt,
            temperature: 0.1,
            maxTokens: 4096,
          } as any);

          lastRawText = result.text.trim();
          console.log(
            `📤 LLM 原始响应长度: ${lastRawText.length} 字符${attempt > 0 ? ` (重试${attempt})` : ''}`
          );

          // 3. 解析 JSON 输出
          try {
            output = JSON.parse(lastRawText);
            break;
          } catch {
            const match = lastRawText.match(/```json\s*([\s\S]*?)```/);
            if (match) {
              try {
                output = JSON.parse(match[1].trim());
                break;
              } catch {
                // fall through to retry
              }
            }
          }
        }

        if (!output) {
          throw new Error(
            `无法解析 LLM 输出为 JSON (重试${MAX_RETRIES}次后): ${lastRawText.substring(0, 200)}`
          );
        }

        // 4. 输出关键字段
        const responsePlan = String(output.response_plan ?? '<缺失>');
        const content = String(output.content ?? '<缺失>');
        const exitVal = String(output.exit ?? '<缺失>');
        const crisisDetected = output.crisis_detected;

        const charCount = countChineseChars(content);

        console.log(`📋 response_plan: "${responsePlan}"`);
        console.log(`💬 content: "${content}"`);
        console.log(`🔢 中文字数（含中文标点）: ${charCount}`);
        console.log(`🚪 exit: ${exitVal} | 🆘 crisis_detected: ${crisisDetected}`);

        // 5. 断言
        // 5a. response_plan 包含期望的策略关键词
        expect(
          responsePlan,
          `response_plan 应包含策略关键词 "${scenario.expectedStrategy}"`
        ).toContain(scenario.expectedStrategy);

        // 5b. content 字数在约束范围内（含 LLM 精度容差）
        const maxTolerance = getCharTolerance(scenario.contentLimit.max);
        if (scenario.contentLimit.min) {
          const minTolerance = getCharTolerance(scenario.contentLimit.min, true);
          expect(
            charCount,
            `中文字数 ${charCount} 应 ≥ ${scenario.contentLimit.min} - ${minTolerance}（容差）`
          ).toBeGreaterThanOrEqual(scenario.contentLimit.min - minTolerance);
        }
        expect(
          charCount,
          `中文字数 ${charCount} 应 ≤ ${scenario.contentLimit.max} + ${maxTolerance}（容差）`
        ).toBeLessThanOrEqual(scenario.contentLimit.max + maxTolerance);

        // 5c. 额外检查
        scenario.extraChecks?.(output);

        console.log(`✅ 策略选型正确，字数合规`);
      },
      90000
    ); // 90s timeout per scenario (allows for retries)
  }
});
