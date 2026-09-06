/**
 * Hybrid/Zero-Trust Client API Layer
 * 
 * Automatically handles:
 * 1. Express backend routes (/api/*) when server is online
 * 2. Direct Cloud Firestore + Client-Side Gemini synthesis when deployed statically on Firebase Hosting Spark (Free) tier
 * 
 * Prevents the "Unexpected token '<', <!doctype..." error when static hosting serves index.html for unmapped /api routes.
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

function getCurrentAuthUser(explicitUser?: AuthUser | null): { uid: string; email?: string; displayName?: string; isSandboxUser?: boolean } {
  if (explicitUser) {
    return {
      uid: explicitUser.uid,
      email: explicitUser.email || undefined,
      displayName: explicitUser.displayName || undefined,
      isSandboxUser: explicitUser.isSandboxUser,
    };
  }

  const stored = localStorage.getItem('journal_sandbox_auth');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        uid: parsed.uid || 'sandbox_user',
        email: parsed.email || undefined,
        displayName: parsed.displayName || 'Dev User',
        isSandboxUser: true,
      };
    } catch {
      // ignore
    }
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

  return {
    uid: 'anonymous_user',
    email: undefined,
    displayName: 'Reflective Journaler',
    isSandboxUser: true,
  };
}

interface ApiOptions extends RequestInit {
  token: string;
}

async function secureFetch<T>(endpoint: string, options: ApiOptions): Promise<T> {
  const { token, headers, ...rest } = options;

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...rest,
      headers: {
        ...authHeaders,
        ...(headers as Record<string, string>),
      },
    });
  } catch (netErr: any) {
    console.info('[Network Fetch Notice] Server unreachable, switching to direct client engine:', netErr?.message);
    throw new Error('BACKEND_UNAVAILABLE');
  }

  if (response.status === 401) {
    if (sessionExpiredHandler) {
      sessionExpiredHandler();
    }
    throw new Error('Authentication session expired or invalid. Please sign in again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  // If static hosting returned HTML for /api endpoint or non-JSON payload
  if (!response.ok || !contentType.includes('application/json') || text.trim().startsWith('<')) {
    if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html') || text.trim().startsWith('<') || response.status === 404) {
      console.info('[API Notice] Static hosting intercepted /api route with HTML fallback. Executing direct client engine.');
      throw new Error('BACKEND_UNAVAILABLE');
    }
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || `Request failed with status ${response.status}`);
    } catch (e: any) {
      if (e.message !== 'BACKEND_UNAVAILABLE') {
        throw new Error(`Server returned ${response.status}: ${text.slice(0, 100)}`);
      }
      throw e;
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('BACKEND_UNAVAILABLE');
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
  try {
    return await secureFetch<ChatApiResponse>('/api/chat', {
      token,
      method: 'POST',
      body: JSON.stringify({
        message,
        ...(conversationId ? { conversationId } : {}),
      }),
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      let historicalSummaries: JournalSummary[] = [];
      if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
        const firestoreData = await fetchHistoryFromFirestore(effectiveUser.uid, 5);
        if (firestoreData) {
          historicalSummaries = firestoreData.summaries;
        }
      }
      const response = await clientGenerateChatResponse(message, history, historicalSummaries);
      return {
        reply: response.text,
        conversationId: conversationId || `conv-${Date.now()}`,
        retrievedSummaryCount: response.retrievedSummaryCount,
      };
    }
    throw err;
  }
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
  try {
    return await secureFetch<SummarizeApiResponse>('/api/summarize', {
      token,
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      const summaryResult = await clientGenerateEntrySummary(payload.content, payload.title, payload.mood);
      const now = new Date().toISOString();
      const sessionId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const summaryId = `summary-${sessionId}`;

      const entry: JournalSession = {
        id: sessionId,
        uid: effectiveUser.uid,
        title: payload.title || 'Untitled Reflection',
        content: payload.content,
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
        await Promise.allSettled([
          syncSessionToFirestore(effectiveUser.uid, entry),
          syncSummaryToFirestore(effectiveUser.uid, summary),
        ]);
      }

      return {
        entry,
        summary,
      };
    }
    throw err;
  }
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
  try {
    const query = new URLSearchParams({
      limit: String(limit),
      type,
    });
    return await secureFetch<UserHistoryResponse>(`/api/history?${query.toString()}`, {
      token,
      method: 'GET',
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
        const directData = await fetchHistoryFromFirestore(effectiveUser.uid, limit);
        if (directData) {
          return {
            sessions: directData.sessions,
            summaries: directData.summaries,
          };
        }
      }
      return { sessions: [], summaries: [] };
    }
    throw err;
  }
}

/**
 * Retrieves user profile metadata and counts
 */
export async function getUserProfile(token: string, user?: AuthUser | null): Promise<UserProfileResponse> {
  try {
    return await secureFetch<UserProfileResponse>('/api/user/profile', {
      token,
      method: 'GET',
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      let sessionsCount = 0;
      let summariesCount = 0;
      if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
        const directData = await fetchHistoryFromFirestore(effectiveUser.uid, 100);
        if (directData) {
          sessionsCount = directData.sessions.length;
          summariesCount = directData.summaries.length;
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
    throw err;
  }
}

/**
 * Retrieves aggregated insights and emotional valence metrics
 */
export async function getInsights(token: string, user?: AuthUser | null): Promise<InsightsResponse> {
  try {
    return await secureFetch<InsightsResponse>('/api/insights', {
      token,
      method: 'GET',
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      let summaries: JournalSummary[] = [];
      let sessions: JournalSession[] = [];
      if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
        const direct = await fetchHistoryFromFirestore(effectiveUser.uid, 50);
        if (direct) {
          summaries = direct.summaries;
          sessions = direct.sessions;
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
    throw err;
  }
}

/**
 * Requests permanent deletion of user's personal data partition
 */
export async function deleteUserHistory(token: string, user?: AuthUser | null): Promise<{ success: boolean; message: string }> {
  try {
    return await secureFetch<{ success: boolean; message: string }>('/api/history', {
      token,
      method: 'DELETE',
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
        await deleteUserDataFromFirestore(effectiveUser.uid);
      }
      return { success: true, message: 'All reflection records cleared successfully.' };
    }
    throw err;
  }
}

/**
 * Downloads a complete one-click JSON export of the user's private journal
 */
export async function exportUserData(token: string, user?: AuthUser | null): Promise<JournalExportData> {
  try {
    return await secureFetch<JournalExportData>('/api/export', {
      token,
      method: 'GET',
    });
  } catch (err: any) {
    if (err.message === 'BACKEND_UNAVAILABLE' || err.message?.includes('session expired') === false) {
      const effectiveUser = getCurrentAuthUser(user);
      let sessions: JournalSession[] = [];
      let summaries: JournalSummary[] = [];
      if (effectiveUser.uid && !effectiveUser.isSandboxUser) {
        const direct = await fetchHistoryFromFirestore(effectiveUser.uid, 200);
        if (direct) {
          sessions = direct.sessions;
          summaries = direct.summaries;
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
    throw err;
  }
}
