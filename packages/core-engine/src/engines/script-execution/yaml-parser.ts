import * as yaml from 'js-yaml';
import { z } from 'zod';
import { ActionTypeSchema } from '@heartrule/shared-types';

/**
 * YAML脚本解析器
 */
export class YAMLParser {
  /**
   * 解析YAML字符串
   */
  parse(content: string): unknown {
    try {
      return yaml.load(content);
    } catch (error) {
      throw new Error(`YAML parsing failed: ${(error as Error).message}`);
    }
  }

  /**
   * 序列化为YAML字符串
   */
  stringify(data: unknown): string {
    try {
      return yaml.dump(data);
    } catch (error) {
      throw new Error(`YAML stringification failed: ${(error as Error).message}`);
    }
  }

  /**
   * 验证会谈流程脚本Schema
   */
  validateSessionScript(data: unknown): void {
    const schema = z.object({
      session: z.object({
        session_id: z.string(),
        phases: z.array(
          z.object({
            phase_id: z.string(),
            entry_condition: z.record(z.unknown()).optional(),
            topics: z.array(
              z.object({
                topic_id: z.string(),
                actions: z.array(
                  z.object({
                    action_type: ActionTypeSchema,
                    action_id: z.string(),
                    config: z.record(z.unknown()).optional(),
                  })
                ),
              })
            ),
          })
        ),
      }),
    });

    try {
      schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Session script validation failed: ${JSON.stringify(error.errors)}`);
      }
      throw error;
    }
  }

  /**
   * 验证咨询技术脚本Schema
   */
  validateTechniqueScript(data: unknown): void {
    const schema = z.object({
      topic: z.object({
        topic_id: z.string(),
        actions: z.array(
          z.object({
            action_type: ActionTypeSchema,
            action_id: z.string(),
            config: z.record(z.unknown()).optional(),
          })
        ),
      }),
    });

    try {
      schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Technique script validation failed: ${JSON.stringify(error.errors)}`);
      }
      throw error;
    }
  }
}
