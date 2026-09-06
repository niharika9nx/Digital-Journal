/**
 * Zero-Trust API Client
 * - Exclusively talks to backend Express server routes (/api/*)
 * - Transmits Firebase ID Token via Authorization: Bearer header
 * - Strips and NEVER includes client-supplied 'uid' fields
 * - Detects 401 Unauthorized to trigger session expiration handling
 * - Keeps Gemini AI secrets strictly inaccessible from client-side
 */
import type {
  ChatApiResponse,
  SummarizeApiResponse,
  UserHistoryResponse,
  UserProfileResponse,
  InsightsResponse,
  JournalExportData,
} from '../types';

let sessionExpiredHandler: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: () => void) {
  sessionExpiredHandler = handler;
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

  try {
    const response = await fetch(endpoint, {
      ...rest,
      headers: {
        ...authHeaders,
        ...(headers as Record<string, string>),
      },
    });

    if (response.status === 401) {
      if (sessionExpiredHandler) {
        sessionExpiredHandler();
      }
      throw new Error('Authentication session expired or invalid. Please sign in again.');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(errorBody.error || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (error.message?.includes('session expired')) {
      throw error;
    }
    throw new Error(error.message || 'Network request failed. Please check connection.');
  }
}

/**
 * Sends a conversational message to Gemini AI companion via backend
 */
export async function postChat(
  token: string,
  message: string,
  conversationId?: string
): Promise<ChatApiResponse> {
  return secureFetch<ChatApiResponse>('/api/chat', {
    token,
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversationId } : {}),
    }),
  });
}

/**
 * Saves a reflection and triggers server-side Gemini RAG summarization
 */
export async function postSummarize(
  token: string,
  payload: {
    content: string;
    title?: string;
    mood?: string;
    tags?: string[];
  }
): Promise<SummarizeApiResponse> {
  return secureFetch<SummarizeApiResponse>('/api/summarize', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Retrieves the user's isolated history partition
 */
export async function getHistory(
  token: string,
  limit = 30,
  type: 'all' | 'entries' | 'summaries' | 'conversations' = 'all'
): Promise<UserHistoryResponse> {
  const query = new URLSearchParams({
    limit: String(limit),
    type,
  });
  return secureFetch<UserHistoryResponse>(`/api/history?${query.toString()}`, {
    token,
    method: 'GET',
  });
}

/**
 * Retrieves user profile metadata and counts
 */
export async function getUserProfile(token: string): Promise<UserProfileResponse> {
  return secureFetch<UserProfileResponse>('/api/user/profile', {
    token,
    method: 'GET',
  });
}

/**
 * Retrieves aggregated insights and emotional valence metrics
 */
export async function getInsights(token: string): Promise<InsightsResponse> {
  return secureFetch<InsightsResponse>('/api/insights', {
    token,
    method: 'GET',
  });
}

/**
 * Requests permanent deletion of user's personal data partition
 */
export async function deleteUserHistory(token: string): Promise<{ success: boolean; message: string }> {
  return secureFetch<{ success: boolean; message: string }>('/api/history', {
    token,
    method: 'DELETE',
  });
}

/**
 * Downloads a complete one-click JSON export of the user's private journal
 */
export async function exportUserData(token: string): Promise<JournalExportData> {
  return secureFetch<JournalExportData>('/api/export', {
    token,
    method: 'GET',
  });
}
