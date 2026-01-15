/**
 * 错误处理工具
 * 提供统一的错误捕获、格式化和响应构建功能
 */

import { ErrorCode, ErrorType, type DetailedApiError } from '@heartrule/shared-types';
import type { FastifyReply } from 'fastify';

/**
 * 错误映射配置
 */
interface ErrorMapping {
  code: ErrorCode;
  type: ErrorType;
  statusCode: number;
  messageTemplate: string;
}

/**
 * 错误代码映射表
 */
const ERROR_MAPPINGS: Record<string, ErrorMapping> = {
  'Script not found': {
    code: ErrorCode.SCRIPT_NOT_FOUND,
    type: ErrorType.CONFIGURATION,
    statusCode: 404,
    messageTemplate: 'Script not found',
  },
  'Session not found': {
    code: ErrorCode.SESSION_NOT_FOUND,
    type: ErrorType.SESSION,
    statusCode: 404,
    messageTemplate: 'Session not found or expired',
  },
  'YAML parse error': {
    code: ErrorCode.SCRIPT_PARSE_ERROR,
    type: ErrorType.SYNTAX,
    statusCode: 400,
    messageTemplate: 'Failed to parse script YAML content',
  },
  'Script validation': {
    code: ErrorCode.SCRIPT_VALIDATION_ERROR,
    type: ErrorType.CONFIGURATION,
    statusCode: 400,
    messageTemplate: 'Script structure validation failed',
  },
  'LLM service': {
    code: ErrorCode.LLM_SERVICE_ERROR,
    type: ErrorType.RUNTIME,
    statusCode: 503,
    messageTemplate: 'LLM service is temporarily unavailable',
  },
  'Action execution': {
    code: ErrorCode.ACTION_EXECUTION_ERROR,
    type: ErrorType.RUNTIME,
    statusCode: 500,
    messageTemplate: 'Action execution failed',
  },
  'Variable extraction': {
    code: ErrorCode.VARIABLE_EXTRACTION_ERROR,
    type: ErrorType.RUNTIME,
    statusCode: 500,
    messageTemplate: 'Failed to extract variables from response',
  },
  Database: {
    code: ErrorCode.DATABASE_ERROR,
    type: ErrorType.SYSTEM,
    statusCode: 500,
    messageTemplate: 'Database operation failed',
  },
};

/**
 * 根据错误消息匹配错误类型
 */
function matchErrorType(errorMessage: string): ErrorMapping {
  for (const [key, mapping] of Object.entries(ERROR_MAPPINGS)) {
    if (errorMessage.includes(key)) {
      return mapping;
    }
  }

  // 默认为内部服务器错误
  return {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    type: ErrorType.SYSTEM,
    statusCode: 500,
    messageTemplate: 'An internal server error occurred',
  };
}

/**
 * 构建详细的错误响应
 */
export function buildDetailedError(
  error: Error | unknown,
  context?: {
    scriptId?: string;
    scriptName?: string;
    sessionId?: string;
    position?: {
      phaseIndex: number;
      topicIndex: number;
      actionIndex: number;
      phaseId?: string;
      topicId?: string;
      actionId?: string;
      actionType?: string;
    };
  }
): DetailedApiError {
  const err = error as Error;
  const errorMessage = err.message || 'Unknown error';
  const mapping = matchErrorType(errorMessage);

  const detailedError: DetailedApiError = {
    code: mapping.code,
    type: mapping.type,
    message: mapping.messageTemplate,
    details: errorMessage,
    context: context
      ? {
          ...context,
          position: context.position
            ? {
                phaseIndex: context.position.phaseIndex,
                phaseId: context.position.phaseId || `phase_${context.position.phaseIndex}`,
                topicIndex: context.position.topicIndex,
                topicId: context.position.topicId || `topic_${context.position.topicIndex}`,
                actionIndex: context.position.actionIndex,
                actionId: context.position.actionId || `action_${context.position.actionIndex}`,
                actionType: context.position.actionType || 'unknown',
              }
            : undefined,
          timestamp: new Date().toISOString(),
        }
      : {
          timestamp: new Date().toISOString(),
        },
  };

  // 添加恢复建议
  switch (mapping.code) {
    case ErrorCode.SCRIPT_PARSE_ERROR:
    case ErrorCode.SCRIPT_VALIDATION_ERROR:
      detailedError.recovery = {
        canRetry: false,
        suggestion: 'Please check and fix the script YAML file, then restart debugging',
      };
      break;
    case ErrorCode.LLM_SERVICE_ERROR:
      detailedError.recovery = {
        canRetry: true,
        retryAction: 'Restart debugging session',
        suggestion: 'Check network connection and LLM service availability',
      };
      break;
    case ErrorCode.SESSION_NOT_FOUND:
      detailedError.recovery = {
        canRetry: false,
        retryAction: 'Create a new debugging session',
        suggestion: 'The session may have expired, please restart debugging',
      };
      break;
    case ErrorCode.ACTION_EXECUTION_ERROR:
      detailedError.recovery = {
        canRetry: true,
        retryAction: 'Restart debugging or check action configuration',
        suggestion: 'Review the action configuration in the script',
      };
      break;
    default:
      detailedError.recovery = {
        canRetry: true,
        retryAction: 'Restart debugging session',
        suggestion: 'If the problem persists, please contact support',
      };
  }

  return detailedError;
}

/**
 * 发送错误响应
 */
export function sendErrorResponse(
  reply: FastifyReply,
  error: Error | unknown,
  context?: {
    scriptId?: string;
    scriptName?: string;
    sessionId?: string;
    position?: {
      phaseIndex: number;
      topicIndex: number;
      actionIndex: number;
      phaseId?: string;
      topicId?: string;
      actionId?: string;
      actionType?: string;
    };
  }
): void {
  const detailedError = buildDetailedError(error, context);
  const mapping = matchErrorType((error as Error).message || 'Unknown error');

  reply.status(mapping.statusCode).send({
    success: false,
    error: detailedError,
  });
}

/**
 * 错误日志记录
 */
export function logError(
  logger: { error: (obj: unknown, msg?: string) => void },
  error: Error | unknown,
  context?: Record<string, unknown>
): void {
  logger.error(
    {
      error: {
        message: (error as Error).message,
        stack: (error as Error).stack,
        name: (error as Error).name,
      },
      context,
    },
    'Error occurred'
  );
}
