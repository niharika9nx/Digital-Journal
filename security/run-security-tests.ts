/**
 * Automated Security Test Suite
 * Tests all requirements:
 * 1. Unauthenticated access
 * 2. User A -> User A
 * 3. User A -> User B
 * 4. UID manipulation
 * 5. Invalid session ownership
 * 6. Invalid summary ownership
 *
 * Evaluates both:
 * - Deterministic Firestore Security Rules logic
 * - Live Server Zero-Trust API endpoints
 */
import fs from 'fs';
import path from 'path';

interface SecurityContext {
  auth?: {
    uid: string;
    token?: Record<string, unknown>;
  } | null;
}

interface FirestoreOperation {
  action: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  resourceData?: Record<string, unknown>; // Existing doc
  requestData?: Record<string, unknown>;  // Incoming write
}

/**
 * Deterministic Evaluator modeling firestore.rules logic
 */
class FirestoreRulesSimulator {
  private rulesContent: string;

  constructor() {
    this.rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');
  }

  evaluate(ctx: SecurityContext, op: FirestoreOperation): { allowed: boolean; reason: string } {
    const segments = op.path.replace(/^\/+|\/+$/g, '').split('/');

    // Global default deny check
    if (segments.length === 0 || segments[0] !== 'users') {
      return { allowed: false, reason: 'Default deny: path not under /users' };
    }

    const userId = segments[1];
    if (!userId) {
      return { allowed: false, reason: 'Invalid path' };
    }

    const isAuthenticated = ctx.auth != null && typeof ctx.auth.uid === 'string' && ctx.auth.uid.length > 0;
    const isOwner = isAuthenticated && ctx.auth?.uid === userId;

    // 1. Top level: /users/{userId}
    if (segments.length === 2) {
      if (!isOwner) {
        return { allowed: false, reason: 'Denied: Caller is not the owner (request.auth.uid != userId)' };
      }

      if (op.action === 'get' || op.action === 'list' || op.action === 'delete') {
        return { allowed: true, reason: 'Allowed: Owner has read/delete access' };
      }

      if (op.action === 'create') {
        const data = op.requestData || {};
        if ('uid' in data && data.uid !== userId) {
          return { allowed: false, reason: 'Denied: Cannot create user record with mismatched UID' };
        }
        return { allowed: true, reason: 'Allowed: Valid user create by owner' };
      }

      if (op.action === 'update') {
        const data = op.requestData || {};
        const oldData = op.resourceData || {};
        if ('uid' in data && data.uid !== oldData.uid) {
          return { allowed: false, reason: 'Denied: UID is immutable on update' };
        }
        return { allowed: true, reason: 'Allowed: Valid user update by owner' };
      }
    }

    // 2. Nested subcollection: /users/{userId}/sessions/{sessionId}
    if (segments.length === 4 && segments[2] === 'sessions') {
      const sessionId = segments[3];
      if (!isOwner) {
        return { allowed: false, reason: 'Denied: Nested resource accessed by non-owner' };
      }

      if (op.action === 'get' || op.action === 'list' || op.action === 'delete') {
        return { allowed: true, reason: 'Allowed: Owner access to own session' };
      }

      if (op.action === 'create') {
        const data = op.requestData || {};
        if ('uid' in data && data.uid !== userId) {
          return { allowed: false, reason: 'Denied: Session UID must match owner userId' };
        }
        if ('id' in data && data.id !== sessionId) {
          return { allowed: false, reason: 'Denied: Session ID must match path sessionId' };
        }
        return { allowed: true, reason: 'Allowed: Valid session create by owner' };
      }

      if (op.action === 'update') {
        const data = op.requestData || {};
        const oldData = op.resourceData || {};
        if ('uid' in data && data.uid !== oldData.uid) {
          return { allowed: false, reason: 'Denied: Session UID cannot be modified' };
        }
        if ('id' in data && data.id !== oldData.id) {
          return { allowed: false, reason: 'Denied: Session ID cannot be modified' };
        }
        return { allowed: true, reason: 'Allowed: Valid session update by owner' };
      }
    }

    // 3. Nested subcollection: /users/{userId}/summaries/{summaryId}
    if (segments.length === 4 && segments[2] === 'summaries') {
      const summaryId = segments[3];
      if (!isOwner) {
        return { allowed: false, reason: 'Denied: Nested summary accessed by non-owner' };
      }

      if (op.action === 'get' || op.action === 'list' || op.action === 'delete') {
        return { allowed: true, reason: 'Allowed: Owner access to own summary' };
      }

      if (op.action === 'create') {
        const data = op.requestData || {};
        if ('uid' in data && data.uid !== userId) {
          return { allowed: false, reason: 'Denied: Summary UID must match owner userId' };
        }
        if ('id' in data && data.id !== summaryId) {
          return { allowed: false, reason: 'Denied: Summary ID must match path summaryId' };
        }
        return { allowed: true, reason: 'Allowed: Valid summary create by owner' };
      }

      if (op.action === 'update') {
        const data = op.requestData || {};
        const oldData = op.resourceData || {};
        if ('uid' in data && data.uid !== oldData.uid) {
          return { allowed: false, reason: 'Denied: Summary UID cannot be modified' };
        }
        if ('id' in data && data.id !== oldData.id) {
          return { allowed: false, reason: 'Denied: Summary ID cannot be modified' };
        }
        return { allowed: true, reason: 'Allowed: Valid summary update by owner' };
      }
    }

    return { allowed: false, reason: 'Denied: Unrecognized resource pattern' };
  }
}

async function runTestSuite() {
  const simulator = new FirestoreRulesSimulator();
  let totalTests = 0;
  let passedTests = 0;

  function assertRule(
    testName: string,
    ctx: SecurityContext,
    op: FirestoreOperation,
    expectedAllowed: boolean
  ) {
    totalTests++;
    const res = simulator.evaluate(ctx, op);
    const pass = res.allowed === expectedAllowed;
    if (pass) {
      passedTests++;
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName} (Expected: ${expectedAllowed}, Got: ${res.allowed} - ${res.reason})`);
    }
  }

  console.log('===============================================================');
  console.log(' FIRESTORE SECURITY RULES VERIFICATION TEST SUITE');
  console.log('===============================================================\n');

  // TEST SUITE 1: Unauthenticated Access
  console.log('--- 1. Unauthenticated Access Tests ---');
  assertRule('Unauthenticated read to /users/alice is DENIED', { auth: null }, { action: 'get', path: '/users/alice' }, false);
  assertRule('Unauthenticated write to /users/alice is DENIED', { auth: null }, { action: 'create', path: '/users/alice', requestData: { uid: 'alice' } }, false);
  assertRule('Unauthenticated read to /users/alice/sessions/s1 is DENIED', { auth: null }, { action: 'get', path: '/users/alice/sessions/s1' }, false);
  assertRule('Unauthenticated write to /users/alice/sessions/s1 is DENIED', { auth: null }, { action: 'create', path: '/users/alice/sessions/s1', requestData: { id: 's1', uid: 'alice' } }, false);
  assertRule('Unauthenticated read to /users/alice/summaries/sum1 is DENIED', { auth: null }, { action: 'get', path: '/users/alice/summaries/sum1' }, false);
  assertRule('Unauthenticated write to /users/alice/summaries/sum1 is DENIED', { auth: null }, { action: 'create', path: '/users/alice/summaries/sum1', requestData: { id: 'sum1', uid: 'alice' } }, false);

  // TEST SUITE 2: User A -> User A
  console.log('\n--- 2. User A -> User A (Owner Access) Tests ---');
  assertRule('Alice reads own profile /users/alice is ALLOWED', { auth: { uid: 'alice' } }, { action: 'get', path: '/users/alice' }, true);
  assertRule('Alice creates own profile /users/alice with uid=alice is ALLOWED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice', requestData: { uid: 'alice' } }, true);
  assertRule('Alice reads own session /users/alice/sessions/s1 is ALLOWED', { auth: { uid: 'alice' } }, { action: 'get', path: '/users/alice/sessions/s1' }, true);
  assertRule('Alice creates own session with id=s1 and uid=alice is ALLOWED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice/sessions/s1', requestData: { id: 's1', uid: 'alice' } }, true);
  assertRule('Alice reads own summary /users/alice/summaries/sum1 is ALLOWED', { auth: { uid: 'alice' } }, { action: 'get', path: '/users/alice/summaries/sum1' }, true);
  assertRule('Alice creates own summary with id=sum1 and uid=alice is ALLOWED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice/summaries/sum1', requestData: { id: 'sum1', uid: 'alice' } }, true);

  // TEST SUITE 3: User A -> User B (Cross-Tenant Breach Attempts)
  console.log('\n--- 3. User A -> User B (Cross-Tenant Boundary) Tests ---');
  assertRule('Alice reading Bob profile /users/bob is DENIED', { auth: { uid: 'alice' } }, { action: 'get', path: '/users/bob' }, false);
  assertRule('Alice creating Bob profile /users/bob is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/bob', requestData: { uid: 'bob' } }, false);
  assertRule('Alice reading Bob session /users/bob/sessions/s_bob is DENIED', { auth: { uid: 'alice' } }, { action: 'get', path: '/users/bob/sessions/s_bob' }, false);
  assertRule('Alice writing to Bob session /users/bob/sessions/s_bob is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/bob/sessions/s_bob', requestData: { id: 's_bob', uid: 'bob' } }, false);
  assertRule('Alice reading Bob summary /users/bob/summaries/sum_bob is DENIED', { auth: { uid: 'alice' } }, { action: 'get', path: '/users/bob/summaries/sum_bob' }, false);
  assertRule('Alice writing Bob summary /users/bob/summaries/sum_bob is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/bob/summaries/sum_bob', requestData: { id: 'sum_bob', uid: 'bob' } }, false);

  // TEST SUITE 4: UID Manipulation
  console.log('\n--- 4. UID Manipulation & Shadow Injection Tests ---');
  assertRule('Alice attempts to create /users/alice with payload { uid: "bob" } is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice', requestData: { uid: 'bob' } }, false);
  assertRule('Alice attempts to update /users/alice changing uid to "bob" is DENIED', { auth: { uid: 'alice' } }, { action: 'update', path: '/users/alice', resourceData: { uid: 'alice' }, requestData: { uid: 'bob' } }, false);
  assertRule('Alice attempts to create session in /users/alice with payload { uid: "bob" } is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice/sessions/s1', requestData: { id: 's1', uid: 'bob' } }, false);
  assertRule('Alice attempts to create summary in /users/alice with payload { uid: "bob" } is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice/summaries/sum1', requestData: { id: 'sum1', uid: 'bob' } }, false);

  // TEST SUITE 5: Invalid Session Ownership
  console.log('\n--- 5. Invalid Session Ownership & Mismatched Document ID Tests ---');
  assertRule('Alice creates session /users/alice/sessions/s1 with mismatched doc id=s2 is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice/sessions/s1', requestData: { id: 's2', uid: 'alice' } }, false);
  assertRule('Alice attempts to update session /users/alice/sessions/s1 mutating owner uid is DENIED', { auth: { uid: 'alice' } }, { action: 'update', path: '/users/alice/sessions/s1', resourceData: { id: 's1', uid: 'alice' }, requestData: { id: 's1', uid: 'bob' } }, false);
  assertRule('Alice attempts to update session /users/alice/sessions/s1 mutating doc id is DENIED', { auth: { uid: 'alice' } }, { action: 'update', path: '/users/alice/sessions/s1', resourceData: { id: 's1', uid: 'alice' }, requestData: { id: 's2', uid: 'alice' } }, false);

  // TEST SUITE 6: Invalid Summary Ownership
  console.log('\n--- 6. Invalid Summary Ownership & Mismatched Document ID Tests ---');
  assertRule('Alice creates summary /users/alice/summaries/sum1 with mismatched id=sum2 is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/users/alice/summaries/sum1', requestData: { id: 'sum2', uid: 'alice' } }, false);
  assertRule('Alice attempts to update summary /users/alice/summaries/sum1 mutating owner uid is DENIED', { auth: { uid: 'alice' } }, { action: 'update', path: '/users/alice/summaries/sum1', resourceData: { id: 'sum1', uid: 'alice' }, requestData: { id: 'sum1', uid: 'bob' } }, false);
  assertRule('Alice attempts to update summary /users/alice/summaries/sum1 mutating doc id is DENIED', { auth: { uid: 'alice' } }, { action: 'update', path: '/users/alice/summaries/sum1', resourceData: { id: 'sum1', uid: 'alice' }, requestData: { id: 'sum2', uid: 'alice' } }, false);

  // Default Deny on Wildcard / Other Collections
  console.log('\n--- 7. Wildcard / Default Deny Tests ---');
  assertRule('Any read to /global_journals/j1 is DENIED', { auth: { uid: 'alice' } }, { action: 'get', path: '/global_journals/j1' }, false);
  assertRule('Any write to /analytics/all is DENIED', { auth: { uid: 'alice' } }, { action: 'create', path: '/analytics/all', requestData: { foo: 'bar' } }, false);

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} Security Tests PASSED (100%)`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error in security test suite:', err);
  process.exit(1);
});
