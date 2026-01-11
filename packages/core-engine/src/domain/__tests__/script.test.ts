import { ScriptType, ScriptStatus } from '@heartrule/shared-types';
import { describe, it, expect } from 'vitest';

import { Script } from '../script.js';

describe('Script Domain Model', () => {
  it('should create a new script', () => {
    const script = new Script({
      scriptName: 'CBT Assessment',
      scriptType: ScriptType.SESSION,
      scriptContent: 'session:\n  session_id: test',
      author: 'Test Author',
    });

    expect(script.scriptName).toBe('CBT Assessment');
    expect(script.scriptType).toBe(ScriptType.SESSION);
    expect(script.status).toBe(ScriptStatus.DRAFT);
    expect(script.version).toBe('1.0.0');
  });

  it('should parse script content', () => {
    const script = new Script({
      scriptName: 'Test',
      scriptType: ScriptType.SESSION,
      scriptContent: 'content',
      author: 'Author',
    });

    const parsed = { session: { session_id: 'test' } };
    script.parse(parsed);

    expect(script.parsedContent).toEqual(parsed);
  });

  it('should publish a draft script', () => {
    const script = new Script({
      scriptName: 'Test',
      scriptType: ScriptType.SESSION,
      scriptContent: 'content',
      author: 'Author',
      status: ScriptStatus.DRAFT,
    });

    script.publish();
    expect(script.status).toBe(ScriptStatus.PUBLISHED);
  });

  it('should archive a script', () => {
    const script = new Script({
      scriptName: 'Test',
      scriptType: ScriptType.SESSION,
      scriptContent: 'content',
      author: 'Author',
    });

    script.archive();
    expect(script.status).toBe(ScriptStatus.ARCHIVED);
  });
});
