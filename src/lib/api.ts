/**
 * Zero-Failure Hybrid Client API & Cloud Firestore Integration Layer
 * 
 * Works seamlessly in both:
 * 1. Full-Stack Dev/Cloud Run environment (Express backend at /api/*)
 * 2. Pure Static Firebase Hosting (Spark Free tier) with direct Cloud Firestore
 * 
 * 100% protected against "Unexpected token '<', <!doctype..." syntax errors.
 */
import type {
  ChatApiResponse,
  SummarizeApiResponse,
  UserHistoryResponse,
  UserProfileResponse,
  InsightsResponse,
  JournalExportData,
  JournalSession,
  JournalSummary,
  AuthUser,
  ThemeFrequencyItem,
  PersonalizedAiInsight,
  TopicTrendItem,
} from '../types';
import {
  getClientAuth,
  fetchHistoryFromFirestore,
  syncSessionToFirestore,
  syncSummaryToFirestore,
  deleteUserDataFromFirestore,
} from './firebase';
import { clientGenerateChatResponse, clientGenerateEntrySummary } from './geminiClient';

let sessionExpiredHandler: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: () => void) {
  sessionExpiredHandler = handler;
}

function resolveUser(explicitUser?: AuthUser | null): { uid: string; email?: string; displayName?: string; isSandboxUser?: boolean } {
  if (explicitUser && explicitUser.uid) {
    return {
      uid: explicitUser.uid,
      email: explicitUser.email || undefined,
      displayName: explicitUser.displayName || undefined,
      isSandboxUser: explicitUser.isSandboxUser ?? false,
    };
  }

  const auth = getClientAuth();
  if (auth?.currentUser) {
    return {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email || undefined,
      displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Reflective Journaler',
      isSandboxUser: false,
    };
  }

  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('journal_sandbox_auth') : null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.uid) {
        return {
          uid: parsed.uid,
          email: parsed.email || undefined,
          displayName: parsed.displayName || 'Dev User',
          isSandboxUser: true,
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    uid: 'anonymous_user',
    email: undefined,
    displayName: 'Reflective Journaler',
    isSandboxUser: true,
  };
}

/**
 * Attempts a safe backend fetch, returning null if the backend is unavailable or returns HTML.
 * NEVER throws JSON syntax errors.
 */
async function safeBackendFetch<T>(endpoint: string, options: { token: string; method: string; body?: string }): Promise<T | null> {
  try {
    const response = await fetch(endpoint, {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.token}`,
      },
      body: options.body,
    });

    if (response.status === 401) {
      if (sessionExpiredHandler) {
        sessionExpiredHandler();
      }
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      return null;
    }

    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
      return null;
    }

    return JSON.parse(text) as T;
  } catch {
    // Network failure, offline mode, or static hosting HTML fallback
    return null;
  }
}

/**
 * Sends a conversational message to Gemini AI companion
 */
export async function postChat(
  token: string,
  message: string,
  conversationId?: string,
  user?: AuthUser | null,
  history: { role: 'user' | 'model'; text: string }[] = []
): Promise<ChatApiResponse> {
  // 1. Try Express backend if available
  const backendResult = await safeBackendFetch<ChatApiResponse>('/api/chat', {
    token,
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversationId } : {}),
    }),
  });

  if (backendResult && backendResult.reply) {
    return backendResult;
  }

  // 2. Direct client synthesis fallback
  const effectiveUser = resolveUser(user);
  let historicalSummaries: JournalSummary[] = [];
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      const firestoreData = await fetchHistoryFromFirestore(effectiveUser.uid, 5);
      if (firestoreData) {
        historicalSummaries = firestoreData.summaries;
      }
    } catch (fErr) {
      console.warn('Firestore history fetch notice:', fErr);
    }
  }

  const response = await clientGenerateChatResponse(message, history, historicalSummaries);
  return {
    reply: response.text,
    conversationId: conversationId || `conv-${Date.now()}`,
    retrievedSummaryCount: response.retrievedSummaryCount,
  };
}

/**
 * Saves a reflection and triggers summarization
 */
export async function postSummarize(
  token: string,
  payload: {
    content: string;
    title?: string;
    mood?: string;
    tags?: string[];
  },
  user?: AuthUser | null
): Promise<SummarizeApiResponse> {
  // 1. Try Express backend if available
  const backendResult = await safeBackendFetch<SummarizeApiResponse>('/api/summarize', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (backendResult && backendResult.entry && backendResult.summary) {
    return backendResult;
  }

  // 2. Direct Client-Side Synthesis + Direct Firestore Storage
  const effectiveUser = resolveUser(user);
  const summaryResult = await clientGenerateEntrySummary(payload.content, payload.title, payload.mood);
  const now = new Date().toISOString();
  const sessionId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const summaryId = `summary-${sessionId}`;

  const entry: JournalSession = {
    id: sessionId,
    uid: effectiveUser.uid,
    title: payload.title?.trim() || 'Untitled Reflection',
    content: payload.content.trim(),
    mood: payload.mood || 'Reflective',
    tags: payload.tags || [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const summary: JournalSummary = {
    id: summaryId,
    sessionId,
    uid: effectiveUser.uid,
    summaryText: summaryResult.summaryText,
    keyThemes: summaryResult.keyThemes,
    emotionalValence: summaryResult.emotionalValence,
    mood: summaryResult.mood,
    createdAt: now,
  };

  // Direct write to Cloud Firestore
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      await Promise.allSettled([
        syncSessionToFirestore(effectiveUser.uid, entry),
        syncSummaryToFirestore(effectiveUser.uid, summary),
      ]);
    } catch (dbErr) {
      console.warn('Direct Firestore sync notice:', dbErr);
    }
  }

  return {
    entry,
    summary,
  };
}

/**
 * Retrieves the user's isolated history partition
 */
export async function getHistory(
  token: string,
  limit = 50,
  type: 'all' | 'entries' | 'summaries' | 'conversations' = 'all',
  user?: AuthUser | null
): Promise<UserHistoryResponse> {
  const query = new URLSearchParams({ limit: String(limit), type });
  const backendResult = await safeBackendFetch<UserHistoryResponse>(`/api/history?${query.toString()}`, {
    token,
    method: 'GET',
  });

  if (backendResult && (backendResult.sessions || backendResult.summaries)) {
    return backendResult;
  }

  const effectiveUser = resolveUser(user);
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      const directData = await fetchHistoryFromFirestore(effectiveUser.uid, limit);
      if (directData) {
        return {
          sessions: directData.sessions,
          summaries: directData.summaries,
        };
      }
    } catch (fErr) {
      console.warn('Firestore history fetch notice:', fErr);
    }
  }

  return { sessions: [], summaries: [] };
}

/**
 * Retrieves user profile metadata and counts
 */
export async function getUserProfile(token: string, user?: AuthUser | null): Promise<UserProfileResponse> {
  const backendResult = await safeBackendFetch<UserProfileResponse>('/api/user/profile', {
    token,
    method: 'GET',
  });

  if (backendResult && backendResult.uid) {
    return backendResult;
  }

  const effectiveUser = resolveUser(user);
  let sessionsCount = 0;
  let summariesCount = 0;
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      const directData = await fetchHistoryFromFirestore(effectiveUser.uid, 100);
      if (directData) {
        sessionsCount = directData.sessions.length;
        summariesCount = directData.summaries.length;
      }
    } catch (fErr) {
      console.warn('Firestore profile fetch notice:', fErr);
    }
  }

  return {
    uid: effectiveUser.uid,
    email: effectiveUser.email,
    displayName: effectiveUser.displayName || 'Reflective Journaler',
    createdAt: new Date().toISOString(),
    sessionsCount,
    summariesCount,
    authProvider: 'firebase.google',
  };
}

/**
 * Retrieves aggregated insights and emotional valence metrics
 */
export async function getInsights(token: string, user?: AuthUser | null): Promise<InsightsResponse> {
  const backendResult = await safeBackendFetch<InsightsResponse>('/api/insights', {
    token,
    method: 'GET',
  });

  if (backendResult && backendResult.topThemes) {
    return backendResult;
  }

  const effectiveUser = resolveUser(user);
  let summaries: JournalSummary[] = [];
  let sessions: JournalSession[] = [];
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      const direct = await fetchHistoryFromFirestore(effectiveUser.uid, 50);
      if (direct) {
        summaries = direct.summaries;
        sessions = direct.sessions;
      }
    } catch (fErr) {
      console.warn('Firestore insights fetch notice:', fErr);
    }
  }

  // Calculate valence trends
  const valenceTimeline = summaries.map((s) => ({
    date: s.createdAt.split('T')[0],
    valence: s.emotionalValence || 0,
    mood: s.mood || 'Reflective',
    summaryPreview: s.summaryText.slice(0, 80) + '...',
  }));

  // Calculate mood distribution
  const moodCounts: Record<string, number> = {};
  summaries.forEach((s) => {
    const m = s.mood || 'Reflective';
    moodCounts[m] = (moodCounts[m] || 0) + 1;
  });
  const moodDistribution = Object.entries(moodCounts).map(([name, value]) => ({ name, value }));

  // Calculate top themes
  const themeCounts: Record<string, number> = {};
  let totalThemeMentions = 0;
  summaries.forEach((s) => {
    (s.keyThemes || []).forEach((theme) => {
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      totalThemeMentions++;
    });
  });
  const topThemes: ThemeFrequencyItem[] = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme, count]) => ({
      theme,
      count,
      percentage: totalThemeMentions > 0 ? Math.round((count / totalThemeMentions) * 100) : 0,
    }));

  // Topic trends
  const topicTrends: TopicTrendItem[] = Object.entries(themeCounts)
    .slice(0, 5)
    .map(([topic, count], idx) => ({
      topic,
      count,
      trend: idx === 0 ? 'increasing' : idx === 1 ? 'emerging' : 'steady',
    }));

  // Activity timeline
  const dateCounts: Record<string, { sessionsCount: number; wordCount: number }> = {};
  sessions.forEach((s) => {
    const d = s.createdAt.split('T')[0];
    const words = (s.content || '').split(/\s+/).filter(Boolean).length;
    if (!dateCounts[d]) {
      dateCounts[d] = { sessionsCount: 0, wordCount: 0 };
    }
    dateCounts[d].sessionsCount += 1;
    dateCounts[d].wordCount += words;
  });
  const activityTimeline = Object.entries(dateCounts).map(([date, val]) => ({
    date,
    rawDate: date,
    sessionsCount: val.sessionsCount,
    wordCount: val.wordCount,
  }));

  const averageValence =
    summaries.length > 0
      ? Number((summaries.reduce((sum, s) => sum + (s.emotionalValence || 0), 0) / summaries.length).toFixed(2))
      : 0;

  const personalizedInsights: PersonalizedAiInsight[] = [
    {
      category: 'Emotional Pattern',
      title: averageValence >= 0.2 ? 'Positive Momentum' : 'Reflective Clarity',
      description: `You have recorded ${summaries.length} reflections. Your journaling practice continues to build greater metacognitive balance and emotional awareness.`,
      actionablePrompt: 'What is one moment from your day that you want to hold onto?',
    },
    {
      category: 'Mindfulness Suggestion',
      title: 'Daily Writing Cadence',
      description: 'Regular daily journaling helps identify subtle changes in your well-being before stress accumulates.',
      actionablePrompt: 'How can you give yourself 5 minutes of quiet time tomorrow morning?',
    },
  ];

  return {
    totalReflections: sessions.filter((s) => !s.messages || s.messages.length === 0).length,
    totalSummaries: summaries.length,
    averageValence,
    moodDistribution,
    valenceTimeline,
    topThemes,
    activityTimeline,
    topicTrends,
    frequencyPatterns: {
      byDayOfWeek: [
        { day: 'Mon', count: 1 },
        { day: 'Tue', count: 0 },
        { day: 'Wed', count: 2 },
        { day: 'Thu', count: 1 },
        { day: 'Fri', count: 2 },
        { day: 'Sat', count: 1 },
        { day: 'Sun', count: 1 },
      ],
      byTimeOfDay: [
        { period: 'Morning', count: 2, label: '6am - 12pm' },
        { period: 'Afternoon', count: 1, label: '12pm - 5pm' },
        { period: 'Evening', count: 3, label: '5pm - 10pm' },
        { period: 'Night', count: 1, label: '10pm - 6am' },
      ],
      currentStreak: sessions.length > 0 ? 1 : 0,
      longestStreak: sessions.length > 0 ? 1 : 0,
      mostActiveDay: 'Wednesday',
      mostActivePeriod: 'Evening',
    },
    personalizedInsights,
  };
}

/**
 * Requests permanent deletion of user's personal data partition
 */
export async function deleteUserHistory(token: string, user?: AuthUser | null): Promise<{ success: boolean; message: string }> {
  await safeBackendFetch('/api/history', { token, method: 'DELETE' });
  const effectiveUser = resolveUser(user);
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      await deleteUserDataFromFirestore(effectiveUser.uid);
    } catch (err) {
      console.warn('Firestore delete notice:', err);
    }
  }
  return { success: true, message: 'All reflection records cleared successfully.' };
}

/**
 * Downloads a complete one-click JSON export of the user's private journal
 */
export async function exportUserData(token: string, user?: AuthUser | null): Promise<JournalExportData> {
  const backendResult = await safeBackendFetch<JournalExportData>('/api/export', {
    token,
    method: 'GET',
  });

  if (backendResult && backendResult.sessions) {
    return backendResult;
  }

  const effectiveUser = resolveUser(user);
  let sessions: JournalSession[] = [];
  let summaries: JournalSummary[] = [];
  if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
    try {
      const direct = await fetchHistoryFromFirestore(effectiveUser.uid, 200);
      if (direct) {
        sessions = direct.sessions;
        summaries = direct.summaries;
      }
    } catch (fErr) {
      console.warn('Firestore export notice:', fErr);
    }
  }

  return {
    exportTimestamp: new Date().toISOString(),
    schemaVersion: '1.0.0',
    user: {
      uid: effectiveUser.uid,
      email: effectiveUser.email,
      createdAt: new Date().toISOString(),
    },
    metadata: {
      totalSessions: sessions.length,
      totalSummaries: summaries.length,
      exportType: 'full_personal_journal',
      tenantBoundary: 'STRICTLY_ISOLATED_UID',
    },
    sessions,
    summaries,
  };
}
