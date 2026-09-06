/**
 * API Routes Definition for Personal Gemini Journal
 * Implements POST /api/chat, POST /api/summarize, and GET /api/history.
 *
 * Each endpoint enforces:
 * 1. Authentication (Firebase ID Token verification)
 * 2. Authorization (Strict UID ownership derived from token)
 * 3. Input validation (Zod schema with strict rejection of unknown parameters)
 * 4. Data access (Scoped exclusively to /users/{uid}/...)
 * 5. Gemini interaction (Server-side via Secret Manager)
 * 6. Error handling (Fail-closed, safe generic errors with zero PII or stack traces)
 * 7. Rate limiting (Per-UID token bucket with standard RFC headers)
 * 8. Structured Logging & Abuse Detection (GCP Cloud Logging schema, anomaly alerts)
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import { createRateLimiter } from './rateLimiter';
import { validateBody, validateQuery, ChatRequestSchema, SummarizeRequestSchema, HistoryQuerySchema } from './validation';
import {
  createJournalEntry,
  createJournalSummary,
  getOrCreateConversation,
  appendConversationMessages,
  getUserHistory,
  getOrCreateUser,
  getUserSessions,
  getUserSummaries,
  clearUserData,
} from './db';
import { generateChatResponse, generateEntrySummary, generatePersonalizedInsights } from './gemini';
import { logStructured, createSafeErrorResponse } from './logger';
import { recordAbuseSignal } from './abuseDetector';

export const apiRouter = Router();

// Per-UID Rate limiters for Gemini-consuming endpoints
const chatRateLimiter = createRateLimiter({
  maxRequests: 15,
  windowMs: 60 * 1000,
  endpointName: 'chat',
});

const summarizeRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60 * 1000,
  endpointName: 'summarize',
});

const historyRateLimiter = createRateLimiter({
  maxRequests: 60,
  windowMs: 60 * 1000,
  endpointName: 'history',
});

const insightsRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000,
  endpointName: 'insights',
});

const exportRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
  endpointName: 'export',
});

/**
 * Endpoint: POST /api/chat
 * Multi-turn conversational companion with pre-retrieval RAG.
 */
apiRouter.post(
  '/chat',
  requireAuth,
  chatRateLimiter,
  validateBody(ChatRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const uid = req.user!.uid;
    const traceId = req.traceId || 'none';
    const { message, conversationId } = req.body;

    try {
      // 1. Fetch or initialize conversation strictly for this UID
      const session = await getOrCreateConversation(uid, conversationId);

      // 2. Execute RAG and call Gemini
      const geminiResult = await generateChatResponse(uid, message, session.messages);

      // 3. Persist messages to user's conversation partition
      const now = new Date().toISOString();
      await appendConversationMessages(uid, session.id, [
        { role: 'user', text: message, timestamp: now },
        { role: 'model', text: geminiResult.text, timestamp: new Date().toISOString() },
      ]);

      const latencyMs = Date.now() - startTime;
      logStructured({
        severity: 'INFO',
        message: 'Chat turn completed successfully',
        traceId,
        userId: uid,
        endpoint: '/api/chat',
        method: 'POST',
        statusCode: 200,
        latencyMs,
        details: {
          conversationId: session.id,
          retrievedSummariesCount: geminiResult.retrievedSummaryCount,
          inputLength: message.length,
        },
      });

      res.status(200).json({
        conversationId: session.id,
        reply: geminiResult.text,
        retrievedSummaryCount: geminiResult.retrievedSummaryCount,
      });
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      const isForbidden = error.statusCode === 403;
      const statusCode = isForbidden ? 403 : 500;

      if (isForbidden) {
        recordAbuseSignal({
          type: 'CROSS_TENANT_ACCESS_ATTEMPT',
          userId: uid,
          traceId,
          endpoint: '/api/chat',
          details: { requestedConversationId: conversationId },
        });
      }

      logStructured({
        severity: isForbidden ? 'WARNING' : 'ERROR',
        message: isForbidden ? 'Cross-tenant access rejected' : 'Error handling /api/chat request',
        traceId,
        userId: uid,
        endpoint: '/api/chat',
        method: 'POST',
        statusCode,
        latencyMs,
        details: { errorName: error?.name, isForbidden },
      });

      const safeError = createSafeErrorResponse({
        statusCode,
        code: isForbidden ? 'FORBIDDEN_CROSS_TENANT' : 'CHAT_PROCESSING_FAILED',
        message: isForbidden
          ? 'Access denied: You do not have permission to access the requested conversation.'
          : 'Failed to process chat conversation. Please try again shortly.',
        traceId,
      });

      res.status(statusCode).json(safeError);
    }
  }
);

/**
 * Endpoint: POST /api/summarize
 * Saves a new journal entry and generates an objective RAG summary.
 */
apiRouter.post(
  '/summarize',
  requireAuth,
  summarizeRateLimiter,
  validateBody(SummarizeRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const uid = req.user!.uid;
    const traceId = req.traceId || 'none';
    const { content, title, mood, tags } = req.body;

    try {
      // 1. Create persistent journal entry in isolated subcollection
      const entry = await createJournalEntry(uid, { content, title, mood, tags });

      // 2. Generate structured summary using Gemini server-side
      const summaryData = await generateEntrySummary(uid, content, title, mood);

      // 3. Persist summary for isolated RAG retrieval
      const summary = await createJournalSummary(uid, {
        entryId: entry.id,
        summaryText: summaryData.summaryText,
        keyThemes: summaryData.keyThemes,
        emotionalValence: summaryData.emotionalValence,
        mood: summaryData.mood,
        embedding: summaryData.embedding,
      });

      const latencyMs = Date.now() - startTime;
      logStructured({
        severity: 'INFO',
        message: 'Journal entry and summary generated successfully',
        traceId,
        userId: uid,
        endpoint: '/api/summarize',
        method: 'POST',
        statusCode: 201,
        latencyMs,
        details: {
          entryId: entry.id,
          summaryId: summary.id,
          themesCount: summary.keyThemes.length,
          contentLength: content.length,
        },
      });

      res.status(201).json({
        entry,
        summary,
      });
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      logStructured({
        severity: 'ERROR',
        message: 'Error handling /api/summarize request',
        traceId,
        userId: uid,
        endpoint: '/api/summarize',
        method: 'POST',
        statusCode: 500,
        latencyMs,
        details: { errorName: error?.name },
      });

      const safeError = createSafeErrorResponse({
        statusCode: 500,
        code: 'SUMMARIZATION_FAILED',
        message: 'Failed to create journal entry and summary. Please try again.',
        traceId,
      });

      res.status(500).json(safeError);
    }
  }
);

/**
 * Endpoint: GET /api/history
 * Fetches historical journal entries, summaries, and conversation metadata.
 */
apiRouter.get(
  '/history',
  requireAuth,
  historyRateLimiter,
  validateQuery(HistoryQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const uid = req.user!.uid;
    const traceId = req.traceId || 'none';
    const query = (req as any).validatedQuery || { limit: 20, type: 'all' };

    try {
      const history = await getUserHistory(uid, {
        limit: query.limit,
        type: query.type,
      });

      const latencyMs = Date.now() - startTime;
      logStructured({
        severity: 'INFO',
        message: 'History retrieved successfully',
        traceId,
        userId: uid,
        endpoint: '/api/history',
        method: 'GET',
        statusCode: 200,
        latencyMs,
        details: {
          entriesCount: history.entries?.length || 0,
          summariesCount: history.summaries?.length || 0,
        },
      });

      res.status(200).json(history);
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      logStructured({
        severity: 'ERROR',
        message: 'Error handling /api/history request',
        traceId,
        userId: uid,
        endpoint: '/api/history',
        method: 'GET',
        statusCode: 500,
        latencyMs,
        details: { errorName: error?.name },
      });

      const safeError = createSafeErrorResponse({
        statusCode: 500,
        code: 'HISTORY_RETRIEVAL_FAILED',
        message: 'Failed to retrieve journal history.',
        traceId,
      });

      res.status(500).json(safeError);
    }
  }
);

/**
 * Endpoint: GET /api/user/profile
 * Retrieves verified profile stats strictly for authenticated UID.
 */
apiRouter.get('/user/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const email = req.user!.email;
  const traceId = req.traceId || 'none';

  try {
    const user = await getOrCreateUser(uid, email);
    const sessions = await getUserSessions(uid, 100);
    const summaries = await getUserSummaries(uid, 100);

    res.status(200).json({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || email?.split('@')[0] || 'Reflective Journaler',
      createdAt: user.createdAt,
      sessionsCount: sessions.length,
      summariesCount: summaries.length,
      authProvider: 'firebase.google',
    });
  } catch (error: any) {
    const safeError = createSafeErrorResponse({
      statusCode: 500,
      code: 'PROFILE_LOAD_FAILED',
      message: 'Failed to load user profile.',
      traceId,
    });
    res.status(500).json(safeError);
  }
});

/**
 * Endpoint: GET /api/insights
 * Calculates aggregated personal insights across 6 distinct analytical dimensions:
 * 1. Activity over time (daily session & word volume)
 * 2. Topic trends (tag & theme trajectory)
 * 3. Recurring themes (frequency & distribution)
 * 4. Emotional/sentiment trends (valence timeline & mood distribution)
 * 5. Session frequency patterns (day of week, time of day, active & longest streaks)
 * 6. Personalized AI insights synthesized strictly from the user's private summaries
 */
apiRouter.get('/insights', requireAuth, insightsRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const uid = req.user!.uid;
  const traceId = req.traceId || 'none';

  try {
    const [summaries, sessions] = await Promise.all([
      getUserSummaries(uid, 100),
      getUserSessions(uid, 100),
    ]);

    // Guarantee UID strict scoping
    const userSessions = sessions.filter(s => s.uid === uid);
    const userSummaries = summaries.filter(s => s.uid === uid);

    // 1. Activity Over Time (Grouped by date)
    const activityMap = new Map<string, { count: number; words: number }>();
    userSessions.forEach(s => {
      const dateKey = s.createdAt.split('T')[0];
      const sessionWords = (s.content || '').trim().split(/\s+/).filter(Boolean).length;
      const messageWords = (s.messages || []).reduce(
        (acc, m) => acc + (m.text || '').trim().split(/\s+/).filter(Boolean).length,
        0
      );
      const totalWords = sessionWords + messageWords;

      const current = activityMap.get(dateKey) || { count: 0, words: 0 };
      activityMap.set(dateKey, {
        count: current.count + 1,
        words: current.words + totalWords,
      });
    });

    const activityTimeline = Array.from(activityMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([rawDate, stats]) => ({
        rawDate,
        date: new Date(rawDate + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        sessionsCount: stats.count,
        wordCount: stats.words,
      }));

    // 2. Topic Trends & Recurring Themes
    const allTopics: { topic: string; timestamp: number }[] = [];
    const themeFrequency: Record<string, number> = {};

    userSessions.forEach(s => {
      const time = new Date(s.createdAt).getTime();
      (s.tags || []).forEach(t => {
        const clean = t.trim();
        if (clean) allTopics.push({ topic: clean, timestamp: time });
      });
    });

    userSummaries.forEach(s => {
      const time = new Date(s.createdAt).getTime();
      (s.keyThemes || []).forEach(t => {
        const clean = t.trim();
        if (clean) {
          allTopics.push({ topic: clean, timestamp: time });
          themeFrequency[clean] = (themeFrequency[clean] || 0) + 1;
        }
      });
    });

    // Classify topic trends (recent vs older)
    const now = Date.now();
    const midPoint = now - 14 * 24 * 60 * 60 * 1000; // 14 days split
    const topicAggregates: Record<string, { total: number; recent: number; older: number }> = {};

    allTopics.forEach(({ topic, timestamp }) => {
      if (!topicAggregates[topic]) {
        topicAggregates[topic] = { total: 0, recent: 0, older: 0 };
      }
      topicAggregates[topic].total += 1;
      if (timestamp >= midPoint) {
        topicAggregates[topic].recent += 1;
      } else {
        topicAggregates[topic].older += 1;
      }
    });

    const topicTrends = Object.entries(topicAggregates)
      .map(([topic, stats]) => {
        let trend: 'increasing' | 'steady' | 'emerging' = 'steady';
        if (stats.older === 0 && stats.recent > 0) trend = 'emerging';
        else if (stats.recent > stats.older) trend = 'increasing';
        return {
          topic,
          count: stats.total,
          trend,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topThemes = Object.entries(themeFrequency)
      .map(([theme, count]) => ({
        theme,
        count,
        percentage: userSummaries.length > 0 ? Math.round((count / userSummaries.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // 3. Emotional / Sentiment Trends
    const moodCounts: Record<string, number> = {};
    userSessions.forEach(s => {
      const mood = s.mood || 'Reflective';
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });

    const moodDistribution = Object.entries(moodCounts).map(([name, count]) => ({
      name,
      value: count,
    }));

    const valenceTimeline = [...userSummaries]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(s => ({
        date: new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        valence: Number((s.emotionalValence ?? 0).toFixed(2)),
        mood: s.mood || 'Reflective',
        summaryPreview: s.summaryText ? s.summaryText.substring(0, 60) + '...' : '',
      }));

    // 4. Session Frequency Patterns (Day of week & Time of day)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const periodCounts = {
      morning: 0,   // 06:00 - 11:59
      afternoon: 0, // 12:00 - 17:59
      evening: 0,   // 18:00 - 23:59
      night: 0,     // 00:00 - 05:59
    };

    const uniqueActiveDates = new Set<string>();

    userSessions.forEach(s => {
      const date = new Date(s.createdAt);
      dayCounts[date.getDay()] += 1;
      const hour = date.getHours();
      if (hour >= 6 && hour < 12) periodCounts.morning += 1;
      else if (hour >= 12 && hour < 18) periodCounts.afternoon += 1;
      else if (hour >= 18 && hour < 24) periodCounts.evening += 1;
      else periodCounts.night += 1;

      uniqueActiveDates.add(s.createdAt.split('T')[0]);
    });

    const byDayOfWeek = dayNames.map((day, idx) => ({
      day,
      count: dayCounts[idx],
    }));

    const byTimeOfDay = [
      { period: 'Morning', label: '6am – 12pm', count: periodCounts.morning },
      { period: 'Afternoon', label: '12pm – 6pm', count: periodCounts.afternoon },
      { period: 'Evening', label: '6pm – 12am', count: periodCounts.evening },
      { period: 'Night', label: '12am – 6am', count: periodCounts.night },
    ];

    // Compute streaks from sorted unique calendar days
    const sortedDates = Array.from(uniqueActiveDates).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    for (const dateStr of sortedDates) {
      const d = new Date(dateStr + 'T00:00:00Z');
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const diffDays = Math.round((d.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) {
          tempStreak += 1;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = d;
    }

    // Check if current streak extends to today or yesterday
    if (sortedDates.length > 0) {
      const lastDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00Z');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const diffFromToday = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
      if (diffFromToday <= 1) {
        currentStreak = tempStreak;
      } else {
        currentStreak = 0;
      }
    }

    const mostActiveDay = byDayOfWeek.reduce((max, cur) => (cur.count > max.count ? cur : max), byDayOfWeek[0]).day;
    const mostActivePeriod = byTimeOfDay.reduce((max, cur) => (cur.count > max.count ? cur : max), byTimeOfDay[0]).period;

    // 5. Personalized Insights Synthesized with Gemini AI (strictly for this UID)
    const personalizedInsights = await generatePersonalizedInsights(uid, userSummaries);

    // 6. Global Stats
    const avgValence = userSummaries.length > 0
      ? userSummaries.reduce((acc, curr) => acc + (curr.emotionalValence || 0), 0) / userSummaries.length
      : 0;

    const latencyMs = Date.now() - startTime;
    logStructured({
      severity: 'INFO',
      message: 'Aggregated user insights successfully',
      traceId,
      userId: uid,
      endpoint: '/api/insights',
      method: 'GET',
      statusCode: 200,
      latencyMs,
      details: {
        totalReflections: userSessions.length,
        totalSummaries: userSummaries.length,
        themesCount: topThemes.length,
        currentStreak,
      },
    });

    res.status(200).json({
      totalReflections: userSessions.length,
      totalSummaries: userSummaries.length,
      averageValence: Number(avgValence.toFixed(2)),
      moodDistribution,
      valenceTimeline,
      topThemes,
      activityTimeline,
      topicTrends,
      frequencyPatterns: {
        byDayOfWeek,
        byTimeOfDay,
        currentStreak,
        longestStreak,
        mostActiveDay,
        mostActivePeriod,
      },
      personalizedInsights,
      lastGeneratedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    logStructured({
      severity: 'ERROR',
      message: 'Error handling /api/insights request',
      traceId,
      userId: uid,
      endpoint: '/api/insights',
      method: 'GET',
      statusCode: 500,
      latencyMs,
      details: { errorName: error?.name },
    });

    const safeError = createSafeErrorResponse({
      statusCode: 500,
      code: 'INSIGHTS_AGGREGATION_FAILED',
      message: 'Failed to aggregate personal insights.',
      traceId,
    });
    res.status(500).json(safeError);
  }
});

/**
 * Endpoint: GET /api/export
 * One-click comprehensive JSON data export strictly scoped to authenticated user.
 * Never leaks data from another user or accesses cross-tenant paths.
 */
apiRouter.get('/export', requireAuth, exportRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const uid = req.user!.uid;
  const email = req.user!.email;
  const traceId = req.traceId || 'none';

  try {
    const [user, sessions, summaries] = await Promise.all([
      getOrCreateUser(uid, email),
      getUserSessions(uid, 500),
      getUserSummaries(uid, 500),
    ]);

    // Strict boundary enforcement: verify every returned record belongs to this UID
    const safeSessions = sessions.filter(s => s.uid === uid).map(s => ({
      id: s.id,
      title: s.title,
      content: s.content,
      mood: s.mood,
      tags: s.tags,
      messages: s.messages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    const safeSummaries = summaries.filter(s => s.uid === uid).map(s => ({
      id: s.id,
      sessionId: s.sessionId,
      summaryText: s.summaryText,
      keyThemes: s.keyThemes,
      emotionalValence: s.emotionalValence,
      mood: s.mood,
      createdAt: s.createdAt,
    }));

    const exportPayload = {
      exportTimestamp: new Date().toISOString(),
      schemaVersion: '1.0.0',
      user: {
        uid: user.uid,
        email: user.email,
        createdAt: user.createdAt,
      },
      metadata: {
        totalSessions: safeSessions.length,
        totalSummaries: safeSummaries.length,
        exportType: 'full_personal_journal',
        tenantBoundary: 'STRICTLY_ISOLATED_UID',
      },
      sessions: safeSessions,
      summaries: safeSummaries,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="personal-journal-export-${dateStr}.json"`);

    const latencyMs = Date.now() - startTime;
    logStructured({
      severity: 'INFO',
      message: 'User exported personal journal data partition',
      traceId,
      userId: uid,
      endpoint: '/api/export',
      method: 'GET',
      statusCode: 200,
      latencyMs,
      details: {
        sessionsCount: safeSessions.length,
        summariesCount: safeSummaries.length,
      },
    });

    res.status(200).json(exportPayload);
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    logStructured({
      severity: 'ERROR',
      message: 'Error generating user data export',
      traceId,
      userId: uid,
      endpoint: '/api/export',
      method: 'GET',
      statusCode: 500,
      latencyMs,
      details: { errorName: error?.name },
    });

    const safeError = createSafeErrorResponse({
      statusCode: 500,
      code: 'DATA_EXPORT_FAILED',
      message: 'Failed to generate personal journal export.',
      traceId,
    });
    res.status(500).json(safeError);
  }
});

/**
 * Endpoint: DELETE /api/history
 * Strictly purges the authenticated user's records under their UID partition.
 */
apiRouter.delete('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const traceId = req.traceId || 'none';

  try {
    await clearUserData(uid);
    logStructured({
      severity: 'INFO',
      message: 'User purged own journal data partition',
      traceId,
      userId: uid,
      endpoint: '/api/history',
      method: 'DELETE',
      statusCode: 200,
    });
    res.status(200).json({ success: true, message: 'All personal journal records deleted successfully' });
  } catch (error: any) {
    const safeError = createSafeErrorResponse({
      statusCode: 500,
      code: 'HISTORY_PURGE_FAILED',
      message: 'Failed to clear personal history.',
      traceId,
    });
    res.status(500).json(safeError);
  }
});
