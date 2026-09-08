/**
 * FakeMemoryRepository 单元测试
 *
 * 验证:
 * - retain: 消息正确存储，按 userId 隔离
 * - recall: 返回预填充 MemoryContext，无预填时返回空上下文
 * - reflect: 调用计数递增
 * - 多用户隔离
 */
import { describe, it, expect, beforeEach } from 'vitest';

import type { MemoryContext } from '../../../src/domain/ports/memory-repository.port.js';
import { FakeMemoryRepository } from '../../helpers/fake-memory-repository.js';

describe('FakeMemoryRepository', () => {
  let repo: FakeMemoryRepository;

  beforeEach(() => {
    repo = new FakeMemoryRepository();
  });

  describe('retain()', () => {
    it('应该存储消息并按 userId 分组', async () => {
      await repo.retain('user-1', [
        { role: 'user', content: '最近睡得不好' },
        { role: 'assistant', content: '能具体说说吗？' },
      ]);

      const stored = repo.getStoredMessages('user-1');
      expect(stored).toHaveLength(2);
      expect(stored[0].content).toBe('最近睡得不好');
      expect(stored[1].content).toBe('能具体说说吗？');
    });

    it('应该追加消息到已有的记忆中', async () => {
      await repo.retain('user-1', [{ role: 'user', content: '第一轮' }]);
      await repo.retain('user-1', [{ role: 'user', content: '第二轮' }]);

      const stored = repo.getStoredMessages('user-1');
      expect(stored).toHaveLength(2);
    });

    it('应该隔离不同 userId 的消息', async () => {
      await repo.retain('user-1', [{ role: 'user', content: 'user-1的消息' }]);
      await repo.retain('user-2', [{ role: 'user', content: 'user-2的消息' }]);

      expect(repo.getStoredMessages('user-1')).toHaveLength(1);
      expect(repo.getStoredMessages('user-2')).toHaveLength(1);
    });
  });

  describe('recall()', () => {
    it('应该返回预填充的 MemoryContext', async () => {
      const prefill: MemoryContext = {
        worldFacts: [{ content: '被诊断为 GAD' }, { content: '服用舍曲林 50mg/天' }],
        experiences: [{ content: '第3次会谈描述了被领导公开批评的场景' }],
        observations: [
          {
            content: '焦虑可能与工作关系中的权力不对等有关',
            proofCount: 2,
            sourceFactIds: ['fact-1', 'fact-2'],
          },
          { content: '用户在权威场景中表现出明显的回避模式' },
        ],
      };
      repo.setRecallData('user-1', prefill);

      const result = await repo.recall('user-1', '用户的核心焦虑');
      expect(result.worldFacts).toHaveLength(2);
      expect(result.experiences).toHaveLength(1);
      expect(result.observations).toHaveLength(2);
      expect(result.observations[0].proofCount).toBe(2);
      expect(result.observations[0].sourceFactIds).toEqual(['fact-1', 'fact-2']);
      expect(result.observations[1].content).toBe('用户在权威场景中表现出明显的回避模式');
    });

    it('应该在无预填充数据时返回空上下文', async () => {
      const result = await repo.recall('unknown-user', '任何查询');
      expect(result.worldFacts).toEqual([]);
      expect(result.experiences).toEqual([]);
      expect(result.observations).toEqual([]);
    });

    it('应该按 userId 隔离预填充数据', async () => {
      repo.setRecallData('user-1', {
        worldFacts: [{ content: 'user-1的事实' }],
        experiences: [],
        observations: [],
      });

      const result1 = await repo.recall('user-1', 'test');
      const result2 = await repo.recall('user-2', 'test');

      expect(result1.worldFacts).toHaveLength(1);
      expect(result2.worldFacts).toHaveLength(0);
    });
  });

  describe('reflect()', () => {
    it('应该记录调用次数', async () => {
      expect(repo.reflectCallCount).toBe(0);
      await repo.reflect('user-1');
      expect(repo.reflectCallCount).toBe(1);
      await repo.reflect('user-1');
      await repo.reflect('user-2');
      expect(repo.reflectCallCount).toBe(3);
    });
  });
});
