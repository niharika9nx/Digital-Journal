/**
 * Firestore Database Access Layer
 * Hard-enforces UID isolation. All queries and writes are strictly scoped to:
 * - /users/{uid}
 * - /users/{uid}/sessions/{sessionId}
 * - /users/{uid}/summaries/{summaryId}
 * Never accesses global collections without UID prefix.
 */
import { getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logStructured } from './logger';

export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface Session {
  id: string;
  uid: string;
  title: string;
  content?: string;
  mood?: string;
  tags?: string[];
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Summary {
  id: string;
  uid: string;
  sessionId: string;
  summaryText: string;
  keyThemes: string[];
  emotionalValence: number; // -1.0 to 1.0
  mood: string;
  embedding?: number[];
  createdAt: string;
}

// Backward-compatibility aliases
export type JournalEntry = Session;
export type JournalSummary = Summary;
export type ConversationSession = Session;

// In-memory fallback repository strictly isolated per UID for sandboxed/local development
class InMemoryTenantStore {
  private users: Map<string, UserProfile> = new Map();
  private sessions: Map<string, Map<string, Session>> = new Map();
  private summaries: Map<string, Summary[]> = new Map();

  getUser(uid: string): UserProfile | null {
    return this.users.get(uid) || null;
  }

  saveUser(uid: string, user: UserProfile): void {
    this.users.set(uid, user);
  }

  getSessions(uid: string): Session[] {
    const userSessions = this.sessions.get(uid);
    if (!userSessions) return [];
    return Array.from(userSessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getSession(uid: string, sessionId: string): Session | null {
    const userSessions = this.sessions.get(uid);
    return userSessions?.get(sessionId) || null;
  }

  findSessionOwner(sessionId: string): string | null {
    for (const [tenantUid, userSessions] of this.sessions.entries()) {
      if (userSessions.has(sessionId)) {
        return tenantUid;
      }
    }
    return null;
  }

  saveSession(uid: string, session: Session): void {
    let userSessions = this.sessions.get(uid);
    if (!userSessions) {
      userSessions = new Map();
      this.sessions.set(uid, userSessions);
    }
    userSessions.set(session.id, session);
  }

  getSummaries(uid: string): Summary[] {
    return this.summaries.get(uid) || [];
  }

  saveSummary(uid: string, summary: Summary): void {
    const list = this.getSummaries(uid);
    this.summaries.set(uid, [summary, ...list]);
  }

  clear(uid: string): void {
    this.sessions.delete(uid);
    this.summaries.delete(uid);
  }
}

const memoryStore = new InMemoryTenantStore();

function getFirestoreDb() {
  try {
    if (getApps().length > 0) {
      return getFirestore();
    }
  } catch {
    // Falls back to in-memory store
  }
  return null;
}

/**
 * Ensures or updates a user profile at /users/{uid}
 */
export async function getOrCreateUser(uid: string, email?: string): Promise<UserProfile> {
  const now = new Date().toISOString();
  const db = getFirestoreDb();

  if (db) {
    try {
      const docRef = db.collection('users').doc(uid);
      const snap = await docRef.get();
      if (snap.exists) {
        return snap.data() as UserProfile;
      }
      const newUser: UserProfile = {
        uid,
        email: email || `${uid}@example.com`,
        createdAt: now,
        updatedAt: now,
      };
      await docRef.set(newUser);
      return newUser;
    } catch {
      // Fall through to memory store
    }
  }

  const existing = memoryStore.getUser(uid);
  if (existing) return existing;

  const newUser: UserProfile = {
    uid,
    email: email || `${uid}@example.com`,
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.saveUser(uid, newUser);
  return newUser;
}

/**
 * Creates or retrieves a session strictly scoped to /users/{uid}/sessions/{sessionId}
 */
export async function getOrCreateSession(
  uid: string,
  sessionId?: string,
  initialData?: { title?: string; content?: string; mood?: string; tags?: string[] }
): Promise<Session> {
  const now = new Date().toISOString();
  const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Invariant: If a session ID is requested, verify it does not belong to another user
  if (sessionId) {
    const foreignOwner = memoryStore.findSessionOwner(sessionId);
    if (foreignOwner && foreignOwner !== uid) {
      const err = new Error('Cross-tenant session access forbidden: Session belongs to another user.');
      (err as any).statusCode = 403;
      throw err;
    }
  }

  const db = getFirestoreDb();

  if (db) {
    try {
      const docRef = db.collection('users').doc(uid).collection('sessions').doc(id);
      const snap = await docRef.get();
      if (snap.exists) {
        return snap.data() as Session;
      }
      const newSession: Session = {
        id,
        uid,
        title: initialData?.title || 'Journal Session',
        content: initialData?.content || '',
        mood: initialData?.mood || 'Reflective',
        tags: initialData?.tags || [],
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      await docRef.set(newSession);
      return newSession;
    } catch {
      // Fall through to memory store
    }
  }

  const existing = memoryStore.getSession(uid, id);
  if (existing) return existing;

  const newSession: Session = {
    id,
    uid,
    title: initialData?.title || 'Journal Session',
    content: initialData?.content || '',
    mood: initialData?.mood || 'Reflective',
    tags: initialData?.tags || [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.saveSession(uid, newSession);
  return newSession;
}

/**
 * Appends messages to a session in /users/{uid}/sessions/{sessionId}
 */
export async function appendSessionMessages(
  uid: string,
  sessionId: string,
  newMessages: ConversationMessage[]
): Promise<Session> {
  const session = await getOrCreateSession(uid, sessionId);
  session.messages.push(...newMessages);
  session.updatedAt = new Date().toISOString();

  const db = getFirestoreDb();
  if (db) {
    try {
      await db
        .collection('users')
        .doc(uid)
        .collection('sessions')
        .doc(sessionId)
        .set(session);
    } catch {
      memoryStore.saveSession(uid, session);
    }
  } else {
    memoryStore.saveSession(uid, session);
  }

  return session;
}

/**
 * Saves a RAG summary in /users/{uid}/summaries/{summaryId}
 */
export async function createSummary(
  uid: string,
  data: { sessionId: string; summaryText: string; keyThemes: string[]; emotionalValence: number; mood: string; embedding?: number[] }
): Promise<Summary> {
  const id = `sum_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const summary: Summary = {
    id,
    uid,
    sessionId: data.sessionId,
    summaryText: data.summaryText,
    keyThemes: data.keyThemes,
    emotionalValence: Math.max(-1, Math.min(1, data.emotionalValence)),
    mood: data.mood,
    embedding: data.embedding,
    createdAt: now,
  };

  const db = getFirestoreDb();
  if (db) {
    try {
      await db
        .collection('users')
        .doc(uid)
        .collection('summaries')
        .doc(id)
        .set(summary);
    } catch {
      memoryStore.saveSummary(uid, summary);
    }
  } else {
    memoryStore.saveSummary(uid, summary);
  }

  return summary;
}

/**
 * Retrieves recent summaries strictly for authenticated UID from /users/{uid}/summaries
 */
export async function getUserSummaries(uid: string, limitCount = 5): Promise<Summary[]> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const snap = await db
        .collection('users')
        .doc(uid)
        .collection('summaries')
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();

      if (!snap.empty) {
        return snap.docs.map(doc => doc.data() as Summary);
      }
    } catch {
      // Fall through to memory store
    }
  }

  return memoryStore.getSummaries(uid).slice(0, limitCount);
}

/**
 * Retrieves sessions strictly for authenticated UID from /users/{uid}/sessions
 */
export async function getUserSessions(uid: string, limitCount = 20): Promise<Session[]> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const snap = await db
        .collection('users')
        .doc(uid)
        .collection('sessions')
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();

      if (!snap.empty) {
        return snap.docs.map(doc => doc.data() as Session);
      }
    } catch {
      // Fall through to memory store
    }
  }

  return memoryStore.getSessions(uid).slice(0, limitCount);
}

// Backward-compatibility wrappers
export async function createJournalEntry(
  uid: string,
  data: { title?: string; content: string; mood?: string; tags?: string[] }
): Promise<Session> {
  return getOrCreateSession(uid, undefined, data);
}

export async function createJournalSummary(
  uid: string,
  data: { entryId: string; summaryText: string; keyThemes: string[]; emotionalValence: number; mood: string; embedding?: number[] }
): Promise<Summary> {
  return createSummary(uid, {
    sessionId: data.entryId,
    summaryText: data.summaryText,
    keyThemes: data.keyThemes,
    emotionalValence: data.emotionalValence,
    mood: data.mood,
    embedding: data.embedding,
  });
}

export async function getOrCreateConversation(uid: string, conversationId?: string): Promise<Session> {
  return getOrCreateSession(uid, conversationId);
}

export async function appendConversationMessages(
  uid: string,
  conversationId: string,
  newMessages: ConversationMessage[]
): Promise<void> {
  await appendSessionMessages(uid, conversationId, newMessages);
}

/**
 * Aggregated history reader strictly scoped to UID
 */
export async function getUserHistory(
  uid: string,
  options: { limit: number; type: 'entries' | 'summaries' | 'conversations' | 'all' }
) {
  const result: {
    entries?: Session[];
    sessions?: Session[];
    summaries?: Summary[];
    conversations?: Session[];
  } = {};

  if (options.type === 'entries' || options.type === 'conversations' || options.type === 'all') {
    const sessions = await getUserSessions(uid, options.limit);
    result.sessions = sessions;
    result.entries = sessions;
    result.conversations = sessions;
  }

  if (options.type === 'summaries' || options.type === 'all') {
    const summaries = await getUserSummaries(uid, options.limit);
    result.summaries = summaries;
  }

  return result;
}

/**
 * Permanently deletes all records belonging to the authenticated user
 */
export async function clearUserData(uid: string): Promise<void> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const sessions = await db.collection('users').doc(uid).collection('sessions').get();
      const batch = db.batch();
      sessions.docs.forEach(doc => batch.delete(doc.ref));
      const summaries = await db.collection('users').doc(uid).collection('summaries').get();
      summaries.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch {
      // Fall through to memory store clear
    }
  }
  memoryStore.clear(uid);
}
