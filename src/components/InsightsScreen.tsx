/**
 * Screen 7: Personal Insights Dashboard
 *
 * Implements all 7 analytical features:
 * 1. Journal activity over time (Session & word volume)
 * 2. Topic trends (Emerging vs increasing themes & tags)
 * 3. Recurring themes (Frequency & percentage distribution)
 * 4. Emotional/sentiment trends (Valence trajectory & mood breakdown)
 * 5. Session frequency patterns (Day of week, time of day, active streak)
 * 6. Personalized AI insights based on the user's private summaries
 * 7. One-click JSON data export (Strictly UID-scoped)
 */
import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Sparkles,
  Smile,
  Shield,
  Loader2,
  Calendar,
  AlertCircle,
  Tag,
  Download,
  RefreshCw,
  Clock,
  Flame,
  Award,
  ArrowUpRight,
  CheckCircle2,
  FileJson,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import type { InsightsResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import { getInsights, exportUserData } from '../lib/api';

const MOOD_COLORS: Record<string, string> = {
  Grateful: '#4E775B', // muted forest
  Peaceful: '#5A7F8C', // muted slate cyan
  Reflective: '#6C648B', // muted violet slate
  Productive: '#B8863A', // warm ochre
  Inspired: '#B2627A', // rose taupe
  Contemplative: '#78687E', // muted plum
  Anxious: '#B86A46', // warm terra cotta
  Fatigued: '#8C857B', // warm stone gray
};

export const InsightsScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getInsights(user.idToken, user);
      setInsights(data);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate personal insights.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [user]);

  const handleExportData = async () => {
    if (!user || exporting) return;
    setExporting(true);
    setExportSuccess(false);

    try {
      const exportData = await exportUserData(user.idToken, user);
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(exportData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute('download', `personal-journal-export-${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to download export data.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div id="insights-loading" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#8C857B] mx-auto" />
        <h3 className="text-xl font-serif font-normal text-[#1C1917]">Gathering Your Insights</h3>
        <p className="text-xs text-[#78716C] max-w-md mx-auto font-light">
          Synthesizing your reflections, mood flows, and recurring themes...
        </p>
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div id="insights-error" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-8 rounded-3xl bg-white border border-[#EAE5DC] text-center space-y-4 shadow-2xs">
          <AlertCircle className="w-8 h-8 text-[#B85D54] mx-auto" />
          <h3 className="text-base font-serif font-normal text-[#1C1917]">Unable to load insights</h3>
          <p className="text-xs text-[#78716C] max-w-md mx-auto font-light">{error || 'Could not load analytics data.'}</p>
          <button
            id="insights-retry-button"
            onClick={() => fetchInsights()}
            className="px-6 py-2.5 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition cursor-pointer"
          >
            Retry Loading Insights
          </button>
        </div>
      </div>
    );
  }

  const hasTimelineData = insights.valenceTimeline && insights.valenceTimeline.length > 0;
  const hasActivityData = insights.activityTimeline && insights.activityTimeline.length > 0;
  const hasMoodData = insights.moodDistribution && insights.moodDistribution.length > 0;
  const hasThemeData = insights.topThemes && insights.topThemes.length > 0;
  const hasTopicTrends = insights.topicTrends && insights.topicTrends.length > 0;
  const hasPersonalizedAi = insights.personalizedInsights && insights.personalizedInsights.length > 0;
  const freq = insights.frequencyPatterns;

  return (
    <div id="personal-insights-dashboard" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE5DC] pb-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#8C857B] font-medium">
            <Sparkles className="w-3.5 h-3.5 text-[#A87B32]" />
            <span>Personal Patterns & Analytics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#1C1917] tracking-tight">
            Reflective Insights
          </h1>
          <p className="text-xs sm:text-sm text-[#78716C] font-light max-w-2xl leading-relaxed">
            Emotional trends, topic patterns, and deep thematic observations gathered from your private journal entries.
          </p>
        </div>

        {/* Action Controls: Refresh & 1-Click JSON Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="refresh-insights-btn"
            onClick={() => fetchInsights(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#EAE5DC] text-[#57534E] text-xs font-medium hover:bg-[#FAF8F5] transition shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#A87B32]' : 'text-[#8C857B]'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            id="one-click-export-btn"
            onClick={handleExportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EBD8B8]" />
            ) : exportSuccess ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#86EFAC]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#EBD8B8]" />
            )}
            <span>{exporting ? 'Generating JSON...' : exportSuccess ? 'Export Downloaded!' : 'Export Archive'}</span>
          </button>
        </div>
      </div>

      {/* Export Success Notification Banner */}
      {exportSuccess && (
        <div className="p-4 rounded-2xl bg-[#EBF2ED] border border-[#D5E3D8] flex items-center justify-between text-xs text-[#284932]">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#4E775B] shrink-0" />
            <span>
              <strong>Archival Export Downloaded:</strong> Your complete journal archive with {insights.totalReflections} entries has been securely saved.
            </span>
          </div>
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Reflections & Summaries */}
        <div id="stat-total-reflections" className="p-6 rounded-3xl bg-white border border-[#EAE5DC] shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
            <span className="uppercase tracking-wider text-[10px]">Journal Volume</span>
            <Calendar className="w-4 h-4 text-[#8C857B]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-serif font-normal text-[#1C1917]">
              {insights.totalReflections}
            </span>
            <span className="text-xs text-[#8C857B] font-light">entries</span>
          </div>
          <div className="text-xs text-[#78716C] font-light">
            {insights.totalSummaries} syntheses preserved
          </div>
        </div>

        {/* Card 2: Reflection Streak */}
        <div id="stat-current-streak" className="p-6 rounded-3xl bg-white border border-[#EAE5DC] shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
            <span className="uppercase tracking-wider text-[10px]">Writing Streak</span>
            <Flame className="w-4 h-4 text-[#A87B32]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-serif font-normal text-[#1C1917]">
              {freq?.currentStreak || 0}
            </span>
            <span className="text-xs text-[#8C857B] font-light">days active</span>
          </div>
          <div className="text-xs text-[#78716C] font-light flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-[#A87B32]" />
            <span>Longest streak: {freq?.longestStreak || 0} days</span>
          </div>
        </div>

        {/* Card 3: Overall Mood */}
        <div id="stat-avg-valence" className="p-6 rounded-3xl bg-white border border-[#EAE5DC] shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
            <span className="uppercase tracking-wider text-[10px]">Dominant Tone</span>
            <TrendingUp className="w-4 h-4 text-[#4E775B]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-serif font-normal text-[#1C1917] leading-tight">
              {insights.averageValence > 0.2
                ? 'Uplifting & Positive'
                : insights.averageValence < -0.2
                ? 'Working Through Challenges'
                : 'Balanced & Reflective'}
            </span>
          </div>
          <div className="text-xs text-[#78716C] font-light">
            Based on all journal entries
          </div>
        </div>

        {/* Card 4: Privacy & Ownership */}
        <div id="stat-tenant-boundary" className="p-6 rounded-3xl bg-white border border-[#EAE5DC] shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
            <span className="uppercase tracking-wider text-[10px]">Sanctuary Privacy</span>
            <Shield className="w-4 h-4 text-[#4E775B]" />
          </div>
          <div className="text-sm font-serif font-medium text-[#1C1917] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#4E775B]"></span>
            Private & Encrypted
          </div>
          <div className="text-xs text-[#78716C] font-light">
            Exclusive to your authenticated account
          </div>
        </div>
      </div>

      {/* Feature 6: Personalized Insights */}
      <div id="personalized-ai-insights-section" className="bg-[#FAF8F5] rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F4F0E8] border border-[#E8E1D3] flex items-center justify-center text-[#A87B32]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-normal text-[#1C1917]">
                Thematic Insights & Observations
              </h2>
              <p className="text-xs text-[#78716C] font-light">
                Key perspectives and cognitive reflections synthesized by Gemini.
              </p>
            </div>
          </div>
        </div>

        {hasPersonalizedAi ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {insights.personalizedInsights.map((item, idx) => (
              <div
                key={idx}
                id={`personalized-insight-${idx}`}
                className="p-5 rounded-2xl bg-white border border-[#EAE5DC] flex flex-col justify-between space-y-3 shadow-2xs hover:border-[#D6CEBF] transition"
              >
                <div className="space-y-2">
                  <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#FAF8F5] text-[#57534E] border border-[#EAE5DC]">
                    {item.category}
                  </div>
                  <h4 className="text-sm font-serif font-normal text-[#1C1917] leading-snug">
                    {item.title}
                  </h4>
                  <p className="text-xs text-[#78716C] leading-relaxed font-light">
                    {item.description}
                  </p>
                </div>

                {item.actionablePrompt && (
                  <div className="pt-2 border-t border-[#F2ECE1]">
                    <p className="text-[11px] font-serif italic text-[#6B5026] bg-[#FAF6F0] p-3 rounded-xl border border-[#EDE2D0]">
                      &ldquo;{item.actionablePrompt}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#8C857B] bg-white rounded-2xl border border-[#EAE5DC] font-light">
            Write additional journal reflections to unlock synthesized personal patterns.
          </div>
        )}
      </div>

      {/* Feature 1: Journal Activity Over Time (Chart) */}
      <div id="feature-activity-over-time" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#8C857B]" />
              <span>Writing Activity & Volume Over Time</span>
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 font-light">
              Daily frequency of reflection entries and active writing engagement.
            </p>
          </div>
        </div>

        {hasActivityData ? (
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insights.activityTimeline} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A87B32" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#A87B32" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2ECE1" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#8C857B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#EAE5DC' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#8C857B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#EAE5DC' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-3 bg-[#1C1917] text-[#FAF8F5] rounded-xl shadow-lg text-xs space-y-1">
                          <div className="font-semibold">{data.date}</div>
                          <div className="text-[#D6CEBF]">
                            Reflections: <span className="text-[#EBD8B8] font-bold">{data.sessionsCount}</span>
                          </div>
                          <div className="text-[#A8A29E]">
                            Words: <span className="font-mono">{data.wordCount}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sessionsCount"
                  stroke="#1C1917"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#activityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-[#8C857B] font-light">
            Activity timeline will populate as reflections are recorded over multiple days.
          </div>
        )}
      </div>

      {/* Feature 4: Mood Trends (Valence Trajectory) */}
      <div id="feature-sentiment-trends" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#8C857B]" />
              <span>Emotional Tone Trajectory</span>
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 font-light">
              Continuous emotional valence measured across past journal sessions.
            </p>
          </div>
        </div>

        {hasTimelineData ? (
          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={insights.valenceTimeline} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2ECE1" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#8C857B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#EAE5DC' }}
                />
                <YAxis
                  domain={[-1, 1]}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                  tick={{ fontSize: 11, fill: '#8C857B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#EAE5DC' }}
                />
                <ReferenceLine
                  y={0}
                  stroke="#D6CEBF"
                  strokeDasharray="2 2"
                  label={{ value: 'Balanced', position: 'right', fill: '#8C857B', fontSize: 10 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-3 bg-[#1C1917] text-[#FAF8F5] rounded-xl shadow-lg text-xs space-y-1 max-w-xs">
                          <div className="font-semibold flex justify-between gap-4">
                            <span>{data.date}</span>
                            <span className="text-[#EBD8B8] font-medium">
                              {data.mood}
                            </span>
                          </div>
                          {data.summaryPreview && (
                            <div className="text-[11px] text-[#A8A29E] border-t border-[#2E2A27] pt-1 mt-1 font-light">
                              {data.summaryPreview}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="valence"
                  stroke="#1C1917"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#1C1917', strokeWidth: 2, stroke: '#FAF8F5' }}
                  activeDot={{ r: 6, fill: '#A87B32', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-[#8C857B] font-light">
            Record journal reflections to plot your emotional trajectory over time.
          </div>
        )}
      </div>

      {/* Two Column Grid: Frequency Patterns & Mood Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature 5: Session Frequency Patterns */}
        <div id="feature-frequency-patterns" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-5">
          <div>
            <h3 className="text-sm font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#8C857B]" />
              <span>Journaling Cadence & Habits</span>
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 font-light">
              Temporal patterns of when you tend to write and contemplate.
            </p>
          </div>

          {/* Quick Frequency Highlights */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EAE5DC] text-xs space-y-1">
              <span className="text-[#8C857B] block text-[10px] uppercase tracking-wider">Most Active Day</span>
              <span className="font-serif text-base text-[#1C1917] block">
                {freq?.mostActiveDay || '—'}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EAE5DC] text-xs space-y-1">
              <span className="text-[#8C857B] block text-[10px] uppercase tracking-wider">Peak Period</span>
              <span className="font-serif text-base text-[#1C1917] block">
                {freq?.mostActivePeriod || '—'}
              </span>
            </div>
          </div>

          {/* Day of Week Chart */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-[#57534E] block">Weekly Distribution</span>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={freq?.byDayOfWeek || []} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2ECE1" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#8C857B' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#8C857B' }} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="p-2.5 bg-[#1C1917] text-[#FAF8F5] rounded-xl text-xs">
                            <span className="font-semibold">{data.day}:</span> {data.count} entries
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="#38332E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Time of Day Slots */}
          <div className="space-y-2 pt-3 border-t border-[#F2ECE1]">
            <span className="text-xs font-medium text-[#57534E] block">Time of Day Rhythm</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(freq?.byTimeOfDay || []).map((slot, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-[#FAF8F5] border border-[#EAE5DC] text-center">
                  <span className="text-[10px] text-[#8C857B] block uppercase tracking-wider">{slot.period}</span>
                  <span className="text-base font-serif font-normal text-[#1C1917] block my-0.5">{slot.count}</span>
                  <span className="text-[10px] text-[#A8A29E] block font-light">{slot.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature 4 (cont): Mood Distribution */}
        <div id="feature-mood-distribution" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-5">
          <div>
            <h3 className="text-sm font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <Smile className="w-4 h-4 text-[#8C857B]" />
              <span>Mood Frequency Distribution</span>
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 font-light">
              Breakdown of emotional states tagged in your entries.
            </p>
          </div>

          {hasMoodData ? (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.moodDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2ECE1" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#8C857B' }}
                    tickLine={false}
                    axisLine={{ stroke: '#EAE5DC' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#8C857B' }}
                    tickLine={false}
                    axisLine={{ stroke: '#EAE5DC' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="p-2.5 bg-[#1C1917] text-[#FAF8F5] rounded-xl shadow-md text-xs">
                            <span className="font-semibold">{data.name}:</span> {data.value}{' '}
                            {data.value === 1 ? 'reflection' : 'reflections'}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {insights.moodDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={MOOD_COLORS[entry.name] || '#8C857B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#8C857B] font-light">
              No mood records available yet.
            </div>
          )}
        </div>
      </div>

      {/* Two Column Grid: Topic Trends & Recurring Themes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature 2: Topic Trends */}
        <div id="feature-topic-trends" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-4">
          <div>
            <h3 className="text-sm font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-[#8C857B]" />
              <span>Evolving Focus Areas & Topics</span>
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 font-light">
              Emerging and recurring concepts explored across recent reflections.
            </p>
          </div>

          {hasTopicTrends ? (
            <div className="space-y-2.5 pt-2">
              {insights.topicTrends.map((t, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EAE5DC] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8C857B]"></span>
                    <span className="text-xs font-medium text-[#1C1917]">{t.topic}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#8C857B] font-light">
                      {t.count} {t.count === 1 ? 'entry' : 'entries'}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full ${
                        t.trend === 'emerging'
                          ? 'bg-[#F4F0E8] text-[#785E2F] border border-[#E8E1D3]'
                          : t.trend === 'increasing'
                          ? 'bg-[#EBF2ED] text-[#4E775B] border border-[#D5E3D8]'
                          : 'bg-[#EDE8DF] text-[#57534E] border border-[#E0D8CB]'
                      }`}
                    >
                      {t.trend}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#8C857B] font-light">
              Topic trends will appear as you write reflections and add tags.
            </div>
          )}
        </div>

        {/* Feature 3: Recurring Themes */}
        <div id="feature-recurring-themes" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-4">
          <div>
            <h3 className="text-sm font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#A87B32]" />
              <span>Recurring Thematic Threads</span>
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 font-light">
              Core ideas recurring across your reflections.
            </p>
          </div>

          {hasThemeData ? (
            <div className="space-y-3.5 pt-2">
              {insights.topThemes.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-[#1C1917]">
                    <span className="font-serif font-normal text-sm">{item.theme}</span>
                    <span className="text-[#8C857B] text-[11px] font-light">
                      {item.count} {item.count === 1 ? 'mention' : 'mentions'} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#EDE8DF] overflow-hidden">
                    <div
                      className="h-full bg-[#1C1917] rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(item.percentage, 5)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#8C857B] font-light">
              Themes will appear here as you save more journal reflections.
            </div>
          )}
        </div>
      </div>

      {/* Feature 7: One-Click JSON Data Export Card */}
      <div id="feature-data-export-card" className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-[#8C857B]" />
              <h3 className="text-base font-serif font-normal text-[#1C1917]">
                Archival Data Export
              </h3>
            </div>
            <p className="text-xs text-[#78716C] max-w-xl font-light leading-relaxed">
              Export your complete personal journal archive, synthesized summaries, and emotional trends in a clean JSON format for offline preservation.
            </p>
          </div>

          <button
            id="download-export-button"
            onClick={handleExportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition shrink-0 disabled:opacity-50 cursor-pointer self-start sm:self-auto"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#EBD8B8]" />
            ) : (
              <Download className="w-4 h-4 text-[#EBD8B8]" />
            )}
            <span>{exporting ? 'Preparing Archive...' : 'Download JSON Archive'}</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[#F2ECE1] flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#8C857B] font-light">
          <div className="flex items-center gap-3">
            <span>Includes: <strong className="text-[#1C1917] font-medium">{insights.totalReflections} Entries</strong></span>
            <span>•</span>
            <span><strong className="text-[#1C1917] font-medium">{insights.totalSummaries} Summaries</strong></span>
          </div>
          <span className="text-[#57534E] flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#4E775B]" />
            <span>Strictly private to your authenticated identity</span>
          </span>
        </div>
      </div>
    </div>
  );
};
