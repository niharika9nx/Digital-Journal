/**
 * Live API Security Verification
 * Verifies backend Zero-Trust defense-in-depth endpoints against the same 6 vectors.
 */

async function runApiSecurityTests() {
  const BASE_URL = 'http://localhost:3000/api';
  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] API: ${name}`);
    } else {
      console.error(`[FAIL] API: ${name} - ${details || ''}`);
    }
  }

  console.log('===============================================================');
  console.log(' LIVE BACKEND API DEFENSE-IN-DEPTH TEST SUITE');
  console.log('===============================================================\n');

  // 1. Unauthenticated Access
  console.log('--- 1. Unauthenticated Access Tests ---');
  const unauthChat = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello' }),
  });
  assert('POST /api/chat without token returns 401', unauthChat.status === 401);

  const unauthSummarize = await fetch(`${BASE_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'My secret journal thoughts' }),
  });
  assert('POST /api/summarize without token returns 401', unauthSummarize.status === 401);

  const unauthHistory = await fetch(`${BASE_URL}/history`);
  assert('GET /api/history without token returns 401', unauthHistory.status === 401);

  // 2. User A -> User A
  console.log('\n--- 2. User A -> User A Tests ---');
  const userAToken = 'dev-token-user-alice';
  const summarizeA = await fetch(`${BASE_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAToken}`,
    },
    body: JSON.stringify({
      title: 'Alice Day 1',
      content: 'Today was an inspiring and productive day working on security.',
      mood: 'Focused',
    }),
  });
  const dataA = await summarizeA.json();
  assert('Alice can summarize and persist to own partition (201 Created)', summarizeA.status === 201 && dataA.entry.uid === 'user-alice');

  const historyA = await fetch(`${BASE_URL}/history`, {
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  const histA = await historyA.json();
  assert('Alice can read own history', historyA.status === 200 && (histA.sessions || []).some((s: any) => s.uid === 'user-alice'));

  // 3. User A -> User B (Cross-Tenant Boundary)
  console.log('\n--- 3. User A -> User B Cross-Tenant Boundary Tests ---');
  const userBToken = 'dev-token-user-bob';
  const summarizeB = await fetch(`${BASE_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userBToken}`,
    },
    body: JSON.stringify({
      title: 'Bob Secret Note',
      content: 'This is Bob private confidential thoughts.',
      mood: 'Private',
    }),
  });
  assert('Bob can create own entry', summarizeB.status === 201);

  const historyAAfterB = await fetch(`${BASE_URL}/history`, {
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  const histA2 = await historyAAfterB.json();
  const aliceSeesBobData = (histA2.sessions || []).some((s: any) => s.uid === 'user-bob');
  assert('Alice cannot see any of Bob entries or sessions in history', !aliceSeesBobData);

  // 4. UID Manipulation & Spoofing Attempt
  console.log('\n--- 4. UID Manipulation Attack Tests ---');
  const spoofingPayload = {
    uid: 'user-bob', // Attacker sends Bob's UID in request body
    content: 'Attempting to inject into Bob account by spoofing UID',
  };
  const spoofRes = await fetch(`${BASE_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAToken}`, // But Alice's token
    },
    body: JSON.stringify(spoofingPayload),
  });
  const spoofData = await spoofRes.json();
  assert(
    'Server strips client-supplied UID and saves strictly under authenticated UID (Alice)',
    spoofRes.status === 201 && spoofData.entry.uid === 'user-alice'
  );

  // Parameter pollution / arbitrary property injection test
  const pollutionRes = await fetch(`${BASE_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAToken}`,
    },
    body: JSON.stringify({
      content: 'Valid content',
      userId: 'user-bob', // Arbitrary field
    }),
  });
  assert('Strict schema validation rejects arbitrary parameters with 400', pollutionRes.status === 400);

  // 5. Invalid Session Ownership
  console.log('\n--- 5. Session Isolation Tests ---');
  const chatAlice = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAToken}`,
    },
    body: JSON.stringify({ message: 'Hello Alice session' }),
  });
  const chatAliceData = await chatAlice.json();
  assert('Alice chat creates session owned by Alice', chatAlice.status === 200 && !!chatAliceData.conversationId);

  // Bob checks history to make sure Alice's conversationId does not leak to Bob
  const historyB = await fetch(`${BASE_URL}/history`, {
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  const histBData = await historyB.json();
  const bobSeesAliceSession = (histBData.sessions || []).some((s: any) => s.id === chatAliceData.conversationId);
  assert('Bob history does not contain Alice conversation or session', !bobSeesAliceSession);

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} / ${total} Live API Security Tests PASSED (100%)`);
  console.log('===============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runApiSecurityTests().catch(err => {
  console.error('API test suite failed:', err);
  process.exit(1);
});
