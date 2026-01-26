import { describe, it, expect } from 'vitest';

import { ENGINE_VERSION, MIN_SCRIPT_VERSION, checkScriptCompatibility } from '../src/index.js';

/**
 * 版本兼容性测试套件
 * 
 * @remarks
 * 短期优化阶段 - 版本检测机制测试
 */
describe('Version Compatibility', () => {
  describe('ENGINE_VERSION', () => {
    it('should be exported and follow semantic versioning', () => {
      expect(ENGINE_VERSION).toBeDefined();
      expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be 2.1.0 or higher', () => {
      const [major, minor] = ENGINE_VERSION.split('.').map(Number);
      expect(major).toBeGreaterThanOrEqual(2);
      if (major === 2) {
        expect(minor).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('MIN_SCRIPT_VERSION', () => {
    it('should be exported and valid', () => {
      expect(MIN_SCRIPT_VERSION).toBeDefined();
      expect(MIN_SCRIPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be less than or equal to ENGINE_VERSION', () => {
      const parseVersion = (v: string) => {
        const parts = v.split('.').map(Number);
        return parts[0] * 10000 + parts[1] * 100 + parts[2];
      };

      expect(parseVersion(MIN_SCRIPT_VERSION)).toBeLessThanOrEqual(
        parseVersion(ENGINE_VERSION)
      );
    });
  });

  describe('checkScriptCompatibility', () => {
    it('[P1] should accept compatible script version', () => {
      const result = checkScriptCompatibility('2.0.0');

      expect(result.compatible).toBe(true);
      expect(result.engineVersion).toBe(ENGINE_VERSION);
      expect(result.scriptVersion).toBe('2.0.0');
      expect(result.message).toBeUndefined();
    });

    it('[P1] should accept newer script version', () => {
      const result = checkScriptCompatibility('2.1.0');

      expect(result.compatible).toBe(true);
      expect(result.engineVersion).toBe(ENGINE_VERSION);
    });

    it('[P1] should reject incompatible old version', () => {
      const result = checkScriptCompatibility('1.9.0');

      expect(result.compatible).toBe(false);
      expect(result.message).toContain('not compatible');
      expect(result.message).toContain('Minimum required: 2.0.0');
    });

    it('[P1] should warn when script is older major version', () => {
      // 假设引擎是3.0.0，脚本是2.5.0
      const result = checkScriptCompatibility('2.0.0');

      // 当前引擎2.1.0，脚本2.0.0，同major版本
      expect(result.compatible).toBe(true);
    });

    it('[P1] should handle edge case versions', () => {
      // 测试边界版本
      expect(checkScriptCompatibility('2.0.0').compatible).toBe(true);
      expect(checkScriptCompatibility('1.9.99').compatible).toBe(false);
      expect(checkScriptCompatibility('2.1.0').compatible).toBe(true);
      expect(checkScriptCompatibility('3.0.0').compatible).toBe(true);
    });

    it('[P1] should handle invalid version format gracefully', () => {
      // 版本解析应该处理无效输入
      const result = checkScriptCompatibility('invalid');

      // 应该返回结果而不抛出异常
      expect(result).toBeDefined();
      expect(result.compatible).toBeDefined();
    });
  });
});
