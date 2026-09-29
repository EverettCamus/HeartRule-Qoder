/**
 * TDD test: Branch isolation for V0→V1
 *
 * Tests:
 * 1. initializeSession creates a branchId
 * 2. Normal messages go to the initial branch
 * 3. Rerun creates a NEW branchId, old messages preserved
 * 4. V0 continuation writes to V0's branch, not V1's
 * 5. GET /messages defaults to current branch (V1)
 * 6. GET /messages?branchId=X filters correctly
 * 7. V0 continuation does NOT change session currentBranchId
 */
const BASE = 'http://localhost:3000/api';
const SCRIPT = '6d48caaa-e73a-4535-ad20-2e883f8437ef';
const PROJECT = '4af2a65e-5e2a-40a1-92cd-fc824ceb8b62';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✅ PASS:', msg); }
  else { failed++; console.error('  ❌ FAIL:', msg); }
}

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}
async function get(url) {
  return (await fetch(BASE + url)).json();
}

async function main() {
  console.log('=== Branch Isolation Tests ===\n');

  // Setup: create session
  const s = await post('/sessions', { userId: 'u', scriptId: SCRIPT, initialVariables: {}, projectId: PROJECT });
  const sid = s.sessionId;
  console.log('Session:', sid.substring(0, 8));

  // Test 1: initializeSession creates branchId
  const d1 = await get('/sessions/' + sid);
  const b1 = d1.currentBranchId;
  assert(!!b1, 'initializeSession creates currentBranchId');
  console.log('  initial branchId:', b1?.substring(0, 8));

  // Test 2: All messages in initial branch
  const initMsgs = await get('/sessions/' + sid + '/messages');
  const initCount = initMsgs.data?.length || 0;
  assert(initCount > 0, 'Initial session has messages');

  // Send first user message
  await post('/sessions/' + sid + '/messages', { content: '爸妈' });

  // Test 3: Normal messages go to initial branch (same as currentBranchId)
  const msgsBefore = await get('/sessions/' + sid + '/messages');
  assert(msgsBefore.data?.length > initCount, 'Normal send increases message count');

  // Test 4: Rerun creates new branch
  const rr = await post('/sessions/' + sid + '/rerun', { targetActionId: 'action_1' });
  const d2 = await get('/sessions/' + sid);
  const b2 = d2.currentBranchId;
  assert(!!b2, 'Rerun creates new currentBranchId');
  assert(b2 !== b1, 'Rerun branchId differs from initial branchId');
  console.log('  rerun branchId:', b2?.substring(0, 8));

  // Test 5: Old branch messages preserved (GET with branchId filter)
  if (b1) {
    const msgsOld = await get('/sessions/' + sid + '/messages?branchId=' + b1);
    assert(msgsOld.data?.length > 0, 'V0 branch has messages after rollback');
  }

  // Test 6: Current branch has only rollback messages
  const msgsCur = await get('/sessions/' + sid + '/messages');
  assert(msgsCur.data?.length > 0, 'Current branch has messages after rollback');
  if (b1) {
    const msgsOld = await get('/sessions/' + sid + '/messages?branchId=' + b1);
    // Old branch should have MORE messages (original run went further)
    assert(msgsOld.data?.length !== msgsCur.data?.length, 'V0 and V1 branches have different message counts');
  }

  // Test 7: V0 continuation writes to V0's old branch
  const v0 = await post('/sessions/' + sid + '/messages', { content: 'V0消息', restoreToActionId: 'action_1' });
  if (b1) {
    const msgsV0now = await get('/sessions/' + sid + '/messages?branchId=' + b1);
    assert(msgsV0now.data?.length > 0, 'V0 branch still has messages after continuation');
  }

  // Test 8: V0 continuation does NOT change session currentBranchId
  const d3 = await get('/sessions/' + sid);
  const b3 = d3.currentBranchId;
  assert(b3 === b2, 'V0 continuation does NOT change currentBranchId (stays as V1)');
  console.log('  currentBranchId after V0:', b3?.substring(0, 8));

  // Test 9: GET /messages defaults to V1 branch (not V0)
  const msgsDefault = await get('/sessions/' + sid + '/messages');
  // Default messages should match V1 branch messages (b2)
  const msgsV1 = await get('/sessions/' + sid + '/messages?branchId=' + b2);
  assert(msgsDefault.data?.length === msgsV1.data?.length, 'GET /messages defaults to V1 branch');

  // Test 10: V0 continuation messages are in V0 branch
  if (b1) {
    const msgsV0 = await get('/sessions/' + sid + '/messages?branchId=' + b1);
    const hasV0Msg = msgsV0.data?.some(m => m.content?.includes('V0消息'));
    assert(hasV0Msg, 'V0 continuation message is in V0 branch');
  }

  // Test 11: V0 continuation message NOT in V1 branch
  const hasV0inV1 = msgsV1.data?.some(m => m.content?.includes('V0消息'));
  assert(!hasV0inV1, 'V0 continuation message is NOT in V1 branch');

  // Test 12: V0 continuation creates a NEW runId (not reusing V1's)
  const v0RunId = v0.currentRunId;
  const v1RunId = rr.currentRunId;
  assert(v0RunId && v0RunId !== v1RunId, 'V0 continuation creates new runId (different from V1)');
  console.log('  V0 runId:', v0RunId?.substring(0, 8), 'V1 runId:', v1RunId?.substring(0, 8));

  // Test 13: Debug entries for V0 continuation are under the new runId
  const entries = await get('/sessions/' + sid + '/debug-entries');
  const runIds = [...new Set((entries.data || []).map(e => e.runId))];
  assert(runIds.includes(v0RunId), 'Debug entries include V0 continuation runId');
  assert(runIds.includes(v1RunId), 'Debug entries include V1 runId');
  console.log('  Debug entry runIds:', runIds.map(r => r.substring(0, 8)).join(', '));

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);

  // Print DB state for manual inspection
  console.log('\nSession ID:', sid);
}

main().catch(e => { console.error(e); process.exit(1); });
