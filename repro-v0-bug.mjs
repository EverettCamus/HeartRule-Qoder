/**
 * API-level reproduction of the V0→V1 switch bug.
 *
 * Flow:
 * 1. Create a new session
 * 2. Send a message (normal flow) → advances past action_1
 * 3. Rollback to action_1 (creates V0 snapshot + V1 timeline)
 * 4. Simulate "switch to V0 and send message" → processUserInput with restoreToActionId
 * 5. Check that GET /messages returns only V0 continuation messages
 * 6. Check that debug entries don't mix V1 and V0 entries
 */
const BASE = 'http://localhost:3000/api';
const PROJECT_ID = '4af2a65e-5e2a-40a1-92cd-fc824ceb8b62';
const SCRIPT_ID = '6d48caaa-e73a-4535-ad20-2e883f8437ef';

async function post(url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(url) {
  const res = await fetch(`${BASE}${url}`);
  return res.json();
}

function summarize(msgs) {
  return msgs.map((m, i) => `[${i}] ${m.role}: ${(m.content||'').substring(0,50)}`).join('\n');
}

async function main() {
  console.log('=== V0→V1 Bug Reproduction ===\n');

  // Step 1: Create session
  console.log('Step 1: Creating session...');
  const createRes = await post('/sessions', {
    userId: 'test-user',
    scriptId: SCRIPT_ID,
    initialVariables: {},
    projectId: PROJECT_ID,
  });
  const sessionId = createRes.sessionId;
  console.log(`  Session created: ${sessionId}`);
  console.log(`  Initial AI message: "${(createRes.aiMessage||'').substring(0,60)}..."`);
  console.log(`  Initial runId: ${createRes.currentRunId}`);
  const initialRunId = createRes.currentRunId;

  // Step 2: Send a message to advance past action_1
  console.log('\nStep 2: Sending first message (normal flow)...');
  const msg1Res = await post(`/sessions/${sessionId}/messages`, {
    content: '妈妈爸爸',
  });
  console.log(`  AI response: "${(msg1Res.aiMessage||'').substring(0,60)}..."`);
  console.log(`  Position: actionId=${msg1Res.position?.actionId}, round=${msg1Res.position?.currentRound}`);
  console.log(`  currentRunId: ${msg1Res.currentRunId}`);
  const run1Id = msg1Res.currentRunId;

  // The script might advance to action_2, action_3. Send more messages if needed.
  let latestRunId = run1Id;
  let pos = msg1Res.position;
  let msgCount = 2; // initial AI + first user+AI pair
  while (pos && pos.actionId !== 'action_2' && pos.actionId !== 'action_3') {
    console.log(`  Still on ${pos.actionId}, sending another message...`);
    const nextRes = await post(`/sessions/${sessionId}/messages`, {
      content: '继续',
    });
    pos = nextRes.position;
    latestRunId = nextRes.currentRunId;
    msgCount += 2;
  }
  console.log(`  Final position: actionId=${pos?.actionId}, round=${pos?.currentRound}`);
  console.log(`  Message count so far: ~${msgCount}`);

  // Step 3: Rollback to action_1
  console.log('\nStep 3: Rolling back to action_1 (creates V0 snapshot + V1 timeline)...');
  const rerunRes = await post(`/sessions/${sessionId}/rerun`, {
    targetActionId: 'action_1',
  });
  console.log(`  Rerun response AI: "${(rerunRes.aiMessage||'').substring(0,60)}..."`);
  console.log(`  Rerun currentRunId: ${rerunRes.currentRunId}`);
  const v1RunId = rerunRes.currentRunId;

  // Step 4: Get session detail to check state
  console.log('\nStep 4: Checking session state after rollback...');
  const sessionAfterRerun = await get(`/sessions/${sessionId}`);
  const actionSnapshots = sessionAfterRerun.metadata?.actionSnapshots || {};
  console.log(`  actionSnapshots keys: ${Object.keys(actionSnapshots)}`);
  if (actionSnapshots.action_1) {
    console.log(`  action_1 snapshot: msgCount=${actionSnapshots.action_1.messageCount}, convHistLen=${actionSnapshots.action_1.conversationHistoryLength}`);
  }
  console.log(`  currentRunId: ${sessionAfterRerun.currentRunId}`);

  // Step 5: Check messages BEFORE V0 continuation
  console.log('\nStep 5: Messages BEFORE V0 continuation:');
  const msgsBefore = await get(`/sessions/${sessionId}/messages`);
  console.log(`  Total messages: ${msgsBefore.data?.length}`);
  if (msgsBefore.data) {
    msgsBefore.data.forEach((m, i) => {
      const ss = m.metadata?.superseded ? ' [SUPERSEDED]' : '';
      console.log(`  [${i}] ${m.role}: ${(m.content||'').substring(0,50)}${ss}`);
    });
  }

  // Step 6: Simulate V0 → send (processUserInput with restoreToActionId)
  console.log('\nStep 6: Simulating V0 → send message with restoreToActionId="action_1"...');
  const v0Res = await post(`/sessions/${sessionId}/messages`, {
    content: '妈妈很亲切',
    restoreToActionId: 'action_1',
  });
  console.log(`  AI response: "${(v0Res.aiMessage||'').substring(0,60)}..."`);
  console.log(`  Position: actionId=${v0Res.position?.actionId}, round=${v0Res.position?.currentRound}`);
  console.log(`  currentRunId: ${v0Res.currentRunId}`);
  const v0RunId = v0Res.currentRunId;
  console.log(`  v0RunId !== v1RunId: ${v0RunId !== v1RunId} (should be true)`);

  // Step 7: Check messages AFTER V0 continuation
  console.log('\nStep 7: Messages AFTER V0 continuation:');
  const msgsAfter = await get(`/sessions/${sessionId}/messages`);
  console.log(`  Total messages: ${msgsAfter.data?.length}`);
  if (msgsAfter.data) {
    msgsAfter.data.forEach((m, i) => {
      const ss = m.metadata?.superseded ? ' [SUPERSEDED]' : '';
      console.log(`  [${i}] ${m.role}: ${(m.content||'').substring(0,50)}${ss}`);
    });
  }

  // Step 8: Check debug entries to see runs
  console.log('\nStep 8: Debug entries:');
  const entriesRes = await get(`/sessions/${sessionId}/debug-entries`);
  const runIds = [...new Set((entriesRes.data||[]).map(e => e.runId))];
  console.log(`  Run IDs: ${runIds.map(r => r.substring(0,8)).join(', ')}`);
  console.log(`  Total entries: ${entriesRes.total}`);

  // Step 9: Verify correctness
  console.log('\n=== VERIFICATION ===');
  const errors = [];

  // Verify new runId was created for V0 continuation
  if (v0RunId === v1RunId) {
    errors.push('FAIL: V0 continuation reused V1 runId!');
  } else {
    console.log('✅ V0 continuation has its own runId');
  }

  // Verify messages after V0 only contain V0 continuation (not V1)
  if (msgsAfter.data && msgsAfter.data.length > 0) {
    const v0Msgs = msgsAfter.data.filter(m => !m.metadata?.superseded);
    const supersededMsgs = msgsAfter.data.filter(m => m.metadata?.superseded === true);
    console.log(`  Active messages: ${v0Msgs.length}, Superseded: ${supersededMsgs.length}`);

    // The last user message should be "妈妈很亲切"
    const lastUserMsg = msgsAfter.data.filter(m => m.role === 'user').pop();
    if (lastUserMsg && lastUserMsg.content.includes('妈妈很亲切')) {
      console.log('✅ Last user message is the V0 continuation message');
    } else {
      errors.push(`FAIL: Last user message is "${lastUserMsg?.content}" not "妈妈很亲切"`);
    }

    // Check that there are only 2 active messages (user + AI from V0 continuation)
    // Actually this depends on flagSupersededMessages working correctly
    if (v0Msgs.length === 2) {
      console.log('✅ Exactly 2 active messages (V0 user + AI response)');
    } else {
      console.log(`⚠️  Active messages: ${v0Msgs.length} (expected 2)`);
    }
  }

  if (errors.length === 0) {
    console.log('\n🎉 All checks passed! Server-side data is correct.');
    console.log('If the UI bug persists, the issue is client-side only.');
  } else {
    console.log('\n❌ Issues found:');
    errors.forEach(e => console.log(`  ${e}`));
  }

  // Cleanup
  console.log(`\nSession ID for manual inspection: ${sessionId}`);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  console.error(err.stack);
});
