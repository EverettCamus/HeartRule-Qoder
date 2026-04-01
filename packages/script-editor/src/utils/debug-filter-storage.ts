import type { DebugOutputFilter } from '../types/debug';
import { DEFAULT_DEBUG_FILTER } from '../types/debug';

const STORAGE_KEY = 'debug-output-filter';

/**
 * 保存过滤器配置到 localStorage
 */
export const saveDebugFilter = (filter: DebugOutputFilter): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch (error) {
    console.error('Failed to save debug filter to localStorage:', error);
  }
};

/**
 * 从 localStorage 加载过滤器配置
 */
export const loadDebugFilter = (): DebugOutputFilter => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 验证配置的完整性
      return {
        showError: parsed.showError ?? DEFAULT_DEBUG_FILTER.showError,
        showLLMPrompt: parsed.showLLMPrompt ?? DEFAULT_DEBUG_FILTER.showLLMPrompt,
        showLLMResponse: parsed.showLLMResponse ?? DEFAULT_DEBUG_FILTER.showLLMResponse,
        showVariable: parsed.showVariable ?? DEFAULT_DEBUG_FILTER.showVariable,
        showExecutionLog: parsed.showExecutionLog ?? DEFAULT_DEBUG_FILTER.showExecutionLog,
        showPosition: parsed.showPosition ?? DEFAULT_DEBUG_FILTER.showPosition,
      };
    }
  } catch (error) {
    console.error('Failed to load debug filter from localStorage:', error);
  }
  return DEFAULT_DEBUG_FILTER;
};

/**
 * 清除保存的过滤器配置
 */
export const clearDebugFilter = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear debug filter from localStorage:', error);
  }
};
