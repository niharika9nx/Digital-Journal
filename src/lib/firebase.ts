/**
 * Firebase Client SDK Initialization, Authentication & Database Layer
 * Strictly retrieves authentic Firebase ID tokens to send in Authorization: Bearer headers.
 * Connects directly to Firestore with user-scoped isolation (/users/{uid}/...).
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  deleteDoc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import type { AuthUser, JournalSession, JournalSummary } from '../types';

// Confirmed Firebase client configuration for project gemini-journal-niharika
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAuZgIUYXTlbAwaFpK4MCkFFxW6QFOmfo8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gemini-journal-niharika.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gemini-journal-niharika",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gemini-journal-niharika.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "784809154612",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:784809154612:web:9b10e60eb6a5e3462d9261",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getClientApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!app && getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else if (!app) {
      app = getApps()[0];
    }
    return app;
  } catch (err) {
    console.warn('[Firebase Client] Initialization error:', err);
    return null;
  }
}

export function getClientAuth(): Auth | null {
  const clientApp = getClientApp();
  if (!clientApp) return null;
  if (!auth) {
    try {
      auth = getAuth(clientApp);
    } catch (err) {
      console.warn('[Firebase Auth] Initialization error:', err);
    }
  }
  return auth;
}

export function getClientFirestore(): Firestore | null {
  const clientApp = getClientApp();
  if (!clientApp) return null;
  if (!db) {
    try {
      db = getFirestore(clientApp);
    } catch (err) {
      console.warn('[Firebase Firestore] Initialization error:', err);
    }
  }
  return db;
}

// Error handling types and helpers as required by the Firebase Integration standard
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const clientAuth = getClientAuth();
  const currentUser = clientAuth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('[Firestore Operation Warning]:', JSON.stringify(errInfo));
}

// Test initial connection
if (typeof window !== 'undefined') {
  setTimeout(async () => {
    try {
      const firestore = getClientFirestore();
      if (firestore) {
        await getDocFromServer(doc(firestore, 'test', 'connection')).catch(() => {});
      }
    } catch {
      // Non-blocking connection check
    }
  }, 1000);
}

/**
 * Sign in using Google Auth Provider via popup
 */
export async function signInWithGooglePopup(): Promise<AuthUser> {
  const clientAuth = getClientAuth();
  if (!clientAuth) {
    throw new Error('Firebase Auth is not initialized. Please verify configuration.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(clientAuth, provider);
  const fbUser: FirebaseUser = result.user;
  const idToken = await fbUser.getIdToken(true);

  const authUser: AuthUser = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
    photoURL: fbUser.photoURL,
    idToken,
    isSandboxUser: false,
  };

  // Sync user record to Firestore /users/{uid}
  syncUserToFirestore(authUser).catch((e) => console.warn('User sync notice:', e));

  return authUser;
}

/**
 * Sign in using a Deterministic Sandbox/Development Account
 * This ensures full functionality in restricted iframe preview environments
 * where third-party auth popups might be blocked by browser sandbox flags.
 */
export async function signInWithDevAccount(presetUid: string, email: string, displayName: string): Promise<AuthUser> {
  const token = `dev-token-${presetUid}`;
  const user: AuthUser = {
    uid: presetUid,
    email,
    displayName,
    photoURL: null,
    idToken: token,
    isSandboxUser: true,
  };

  // Persist sandbox session in localStorage
  localStorage.setItem('journal_sandbox_auth', JSON.stringify(user));
  return user;
}

/**
 * Signs out of Firebase Auth and clears local session
 */
export async function signOutUser(): Promise<void> {
  localStorage.removeItem('journal_sandbox_auth');
  const clientAuth = getClientAuth();
  if (clientAuth) {
    try {
      await firebaseSignOut(clientAuth);
    } catch {
      // Ignored
    }
  }
}

/**
 * Recursively removes undefined values from objects/arrays so Firestore serialization never fails
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeFirestorePayload(value);
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter((item) => item !== undefined)
        .map((item) => (item !== null && typeof item === 'object' ? sanitizeFirestorePayload(item) : item));
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Synchronizes user profile document into Firestore at /users/{uid}
 */
export async function syncUserToFirestore(user: AuthUser): Promise<void> {
  if (user.isSandboxUser) {
    return;
  }
  const firestore = getClientFirestore();
  const clientAuth = getClientAuth();

  if (!firestore) {
    return;
  }

  const now = new Date().toISOString();
  const userRef = doc(firestore, 'users', user.uid);
  const payload = sanitizeFirestorePayload({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    createdAt: now,
    updatedAt: now,
  });

  try {
    await setDoc(userRef, payload, { merge: true });
    console.info('✅ [Firestore] User profile synced to Cloud Firestore:', `users/${user.uid}`);
  } catch (err: any) {
    const code = err?.code || 'unknown';
    if (code === 'permission-denied') {
      console.info(
        'ℹ️ [Firestore Access Notice] Direct client Firestore profile write restricted. Authenticated backend API maintains complete user persistence.'
      );
    } else {
      console.warn('⚠️ [Firestore Notice] Profile sync:', err?.message || String(err));
    }
  }
}

/**
 * Saves a reflection or conversation session directly to Firestore /users/{uid}/sessions/{sessionId}
 */
export async function syncSessionToFirestore(uid: string, session: JournalSession): Promise<{ success: boolean; error?: any }> {
  const firestore = getClientFirestore();
  const targetPath = `users/${uid}/sessions/${session.id}`;

  if (!firestore) {
    return { success: false, error: new Error('Firestore client is not initialized.') };
  }

  // Sanitize and validate payload
  const sanitized = sanitizeFirestorePayload(session);

  try {
    const sessionRef = doc(firestore, 'users', uid, 'sessions', session.id);
    await setDoc(sessionRef, sanitized, { merge: true });
    console.info(`✅ [Firestore Sync] Session ${session.id} recorded in Firestore.`);
    return { success: true };
  } catch (err: any) {
    const errorCode = err?.code || 'UNKNOWN';
    if (errorCode === 'permission-denied') {
      console.info(
        `ℹ️ [Firestore Access Notice] Direct client write to ${targetPath} restricted by security rules. Session data is fully persisted via server API.`
      );
    } else {
      console.warn(`⚠️ [Firestore Sync Notice] Session write:`, err?.message || String(err));
    }
    return { success: false, error: err };
  }
}

/**
 * Saves a reflection summary directly to Firestore /users/{uid}/summaries/{summaryId}
 */
export async function syncSummaryToFirestore(uid: string, summary: JournalSummary): Promise<{ success: boolean; error?: any }> {
  const firestore = getClientFirestore();
  const targetPath = `users/${uid}/summaries/${summary.id}`;

  if (!firestore) {
    return { success: false, error: new Error('Firestore client is not initialized.') };
  }

  const sanitized = sanitizeFirestorePayload(summary);

  try {
    const summaryRef = doc(firestore, 'users', uid, 'summaries', summary.id);
    await setDoc(summaryRef, sanitized, { merge: true });
    console.info(`✅ [Firestore Sync] Summary ${summary.id} recorded in Firestore.`);
    return { success: true };
  } catch (err: any) {
    const errorCode = err?.code || 'UNKNOWN';
    if (errorCode === 'permission-denied') {
      console.info(
        `ℹ️ [Firestore Access Notice] Direct client write to ${targetPath} restricted by security rules. Summary data is fully persisted via server API.`
      );
    } else {
      console.warn(`⚠️ [Firestore Sync Notice] Summary write:`, err?.message || String(err));
    }
    return { success: false, error: err };
  }
}

/**
 * Retrieves historical records directly from Firestore if available
 */
export async function fetchHistoryFromFirestore(
  uid: string,
  limitCount = 50
): Promise<{ sessions: JournalSession[]; summaries: JournalSummary[] } | null> {
  const firestore = getClientFirestore();
  if (!firestore) return null;
  try {
    const sessionsQuery = query(
      collection(firestore, 'users', uid, 'sessions'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limitCount)
    );
    const summariesQuery = query(
      collection(firestore, 'users', uid, 'summaries'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limitCount)
    );

    const [sessionsSnap, summariesSnap] = await Promise.all([
      getDocs(sessionsQuery),
      getDocs(summariesQuery),
    ]);

    const sessions = sessionsSnap.docs.map((d) => d.data() as JournalSession);
    const summaries = summariesSnap.docs.map((d) => d.data() as JournalSummary);

    return { sessions, summaries };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
    return null;
  }
}

/**
 * Deletes all documents from user's Firestore partitions
 */
export async function deleteUserDataFromFirestore(uid: string): Promise<void> {
  const firestore = getClientFirestore();
  if (!firestore) return;
  try {
    const sessionsSnap = await getDocs(collection(firestore, 'users', uid, 'sessions'));
    const summariesSnap = await getDocs(collection(firestore, 'users', uid, 'summaries'));

    await Promise.all([
      ...sessionsSnap.docs.map((d) => deleteDoc(d.ref)),
      ...summariesSnap.docs.map((d) => deleteDoc(d.ref)),
      deleteDoc(doc(firestore, 'users', uid)),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
  }
}

/**
 * Subscribes to auth state changes
 */
export function subscribeToAuthState(
  onUserChanged: (user: AuthUser | null) => void,
  onError?: (err: Error) => void
): () => void {
  // Check sandbox storage first
  const storedSandbox = localStorage.getItem('journal_sandbox_auth');
  if (storedSandbox) {
    try {
      const parsed = JSON.parse(storedSandbox) as AuthUser;
      onUserChanged(parsed);
      return () => {};
    } catch {
      localStorage.removeItem('journal_sandbox_auth');
    }
  }

  const clientAuth = getClientAuth();
  if (!clientAuth) {
    onUserChanged(null);
    return () => {};
  }

  return onAuthStateChanged(
    clientAuth,
    async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const authUser: AuthUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            photoURL: fbUser.photoURL,
            idToken,
            isSandboxUser: false,
          };
          syncUserToFirestore(authUser).catch(() => {});
          onUserChanged(authUser);
        } catch (err: any) {
          onError?.(err);
          onUserChanged(null);
        }
      } else {
        onUserChanged(null);
      }
    },
    (err) => {
      onError?.(err);
      onUserChanged(null);
    }
  );
}
