/**
 * Type Definitions for Personal Gemini Journal
 */

export type ScreenType =
  | 'signin'
  | 'dashboard'
  | 'journal'
  | 'history'
  | 'summary'
  | 'profile'
  | 'insights';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  idToken: string;
  isSandboxUser?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface JournalSession {
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

export interface JournalSummary {
  id: string;
  uid: string;
  sessionId: string;
  summaryText: string;
  keyThemes: string[];
  emotionalValence: number; // -1.0 to 1.0
  mood: string;
  createdAt: string;
}

export interface UserHistoryResponse {
  sessions?: JournalSession[];
  summaries?: JournalSummary[];
  entries?: JournalSession[];
}

export interface UserProfileResponse {
  uid: string;
  email?: string;
  displayName?: string;
  createdAt: string;
  sessionsCount: number;
  summariesCount: number;
  authProvider: string;
}

export interface ValenceDataPoint {
  date: string;
  valence: number;
  mood: string;
  summaryPreview: string;
}

export interface MoodDistributionItem {
  name: string;
  value: number;
}

export interface ThemeFrequencyItem {
  theme: string;
  count: number;
  percentage: number;
}

export interface ActivityOverTimeItem {
  date: string;
  rawDate: string;
  sessionsCount: number;
  wordCount: number;
}

export interface TopicTrendItem {
  topic: string;
  count: number;
  trend: 'increasing' | 'steady' | 'emerging';
}

export interface FrequencyPattern {
  byDayOfWeek: { day: string; count: number }[];
  byTimeOfDay: { period: string; count: number; label: string }[];
  currentStreak: number;
  longestStreak: number;
  mostActiveDay: string;
  mostActivePeriod: string;
}

export interface PersonalizedAiInsight {
  category: 'Growth & Resilience' | 'Emotional Pattern' | 'Mindfulness Suggestion' | 'Theme Correlation';
  title: string;
  description: string;
  actionablePrompt: string;
}

export interface InsightsResponse {
  totalReflections: number;
  totalSummaries: number;
  averageValence: number;
  moodDistribution: MoodDistributionItem[];
  valenceTimeline: ValenceDataPoint[];
  topThemes: ThemeFrequencyItem[];
  activityTimeline: ActivityOverTimeItem[];
  topicTrends: TopicTrendItem[];
  frequencyPatterns: FrequencyPattern;
  personalizedInsights: PersonalizedAiInsight[];
  lastGeneratedAt?: string;
}

export interface JournalExportData {
  exportTimestamp: string;
  schemaVersion: string;
  user: {
    uid: string;
    email?: string;
    createdAt?: string;
  };
  metadata: {
    totalSessions: number;
    totalSummaries: number;
    exportType: 'full_personal_journal';
    tenantBoundary: 'STRICTLY_ISOLATED_UID';
  };
  sessions: JournalSession[];
  summaries: JournalSummary[];
}

export interface ChatApiResponse {
  conversationId: string;
  reply: string;
  retrievedSummaryCount: number;
}

export interface SummarizeApiResponse {
  entry: JournalSession;
  summary: JournalSummary;
}
