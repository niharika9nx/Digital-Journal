/**
 * Screen 2: Dashboard / Homepage
 * A calm, private personal space featuring:
 * 1. Warm Editorial Hero with "+ New Reflection" and "Talk with Gemini"
 * 2. Human-readable Insights preview (Reflections, Conversations, Mood, Topics)
 * 3. Your Reflections section
 * 4. Gemini conversation invitation section
 * 5. Prompt of the Day card ("A little something to think about")
 * 6. Privacy guarantee section ("Your reflections are private")
 */
import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  MessageSquare,
  Sparkles,
  ArrowUpRight,
  Shield,
  Clock,
  ChevronRight,
  Loader2,
  Smile,
  Meh,
  Frown,
  Plus,
  Tag,
  ArrowRight,
  Compass,
  Feather,
} from 'lucide-react';
import type { ScreenType, JournalSession, JournalSummary, UserHistoryResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import { getHistory, getInsights } from '../lib/api';
import { fetchHistoryFromFirestore } from '../lib/firebase';

interface DashboardProps {
  onNavigate: (screen: ScreenType, mode?: 'reflect' | 'chat') => void;
  onSelectSession: (session: JournalSession, summary?: JournalSummary) => void;
}

export const DashboardScreen: React.FC<DashboardProps> = ({ onNavigate, onSelectSession }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [recentSessions, setRecentSessions] = useState<JournalSession[]>([]);
  const [recentSummaries, setRecentSummaries] = useState<JournalSummary[]>([]);
  const [totalReflections, setTotalReflections] = useState<number>(0);
  const [totalConversations, setTotalConversations] = useState<number>(0);
  const [totalTopicsCount, setTotalTopicsCount] = useState<number>(0);
  const [avgValence, setAvgValence] = useState<number>(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    async function loadDashboardData() {
      setLoading(true);
      setFetchError(null);
      try {
        const [historyRes, insightsRes, firestoreData] = await Promise.all([
          getHistory(user!.idToken, 10, 'all').catch(() => ({ sessions: [], summaries: [] })),
          getInsights(user!.idToken).catch(() => null),
          !user!.isSandboxUser ? fetchHistoryFromFirestore(user!.uid, 10) : Promise.resolve(null),
        ]);

        if (isMounted) {
          // Combine API and Firestore records, avoiding duplicates
          const apiSessions = (historyRes as UserHistoryResponse).sessions || (historyRes as UserHistoryResponse).entries || [];
          const apiSummaries = historyRes.summaries || [];
          const fsSessions = firestoreData?.sessions || [];
          const fsSummaries = firestoreData?.summaries || [];

          const sessionMap = new Map<string, JournalSession>();
          [...fsSessions, ...apiSessions].forEach((s) => {
            if (s && s.id && !sessionMap.has(s.id)) sessionMap.set(s.id, s);
          });
          const allSessions = Array.from(sessionMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          const summaryMap = new Map<string, JournalSummary>();
          [...fsSummaries, ...apiSummaries].forEach((sum) => {
            if (sum && sum.id && !summaryMap.has(sum.id)) summaryMap.set(sum.id, sum);
          });
          const allSummaries = Array.from(summaryMap.values());

          setRecentSessions(allSessions);
          setRecentSummaries(allSummaries);

          const chatCount = allSessions.filter((s) => s.messages && s.messages.length > 0).length;
          const entryCount = allSessions.filter((s) => !s.messages || s.messages.length === 0).length;

          setTotalReflections(insightsRes?.totalReflections ?? entryCount);
          setTotalConversations(chatCount);
          setTotalTopicsCount(insightsRes?.topThemes?.length ?? (insightsRes?.topicTrends?.length || 0));
          setAvgValence(insightsRes?.averageValence ?? 0);
        }
      } catch (err: any) {
        if (isMounted) {
          setFetchError(err.message || 'Failed to load journal reflections.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const getMoodLabel = (valence: number) => {
    if (valence > 0.3) return 'Uplifted';
    if (valence > 0.05) return 'Gently Optimistic';
    if (valence < -0.3) return 'Working Through Thoughts';
    if (valence < -0.05) return 'Contemplative';
    return 'Balanced';
  };

  const getMoodIcon = (valence: number) => {
    if (valence > 0.2) return <Smile className="w-4 h-4 text-[#4E775B]" />;
    if (valence < -0.2) return <Frown className="w-4 h-4 text-[#B85D54]" />;
    return <Meh className="w-4 h-4 text-[#A87B32]" />;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const userName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* 1. Editorial Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-[#1C1917] text-[#FAF8F5] p-8 sm:p-12 shadow-sm border border-[#2B2724]">
        {/* Subtle warm decorative aura */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#EBD8B8]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2E2926] border border-[#423C37] text-[#EBD8B8] text-xs font-normal tracking-wide">
            <Sparkles className="w-3 h-3 text-[#D4AF37]" />
            <span>Private Sanctuary</span>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-[#A8A29E] font-medium block">
              {getGreeting()}, {userName}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal tracking-tight text-white leading-tight">
              Your space to think.
            </h1>
          </div>

          <p className="text-[#D6D0C4] text-sm sm:text-base leading-relaxed font-light">
            Reflect on your day, explore emerging thoughts, and have quiet, meaningful conversations with Gemini.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            <button
              id="dashboard-new-reflection-btn"
              onClick={() => onNavigate('journal', 'reflect')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#FAF8F5] text-[#1C1917] text-xs sm:text-sm font-semibold hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Reflection</span>
            </button>

            <button
              id="dashboard-talk-gemini-btn"
              onClick={() => onNavigate('journal', 'chat')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#2B2724] text-[#FAF8F5] text-xs sm:text-sm font-medium hover:bg-[#38332F] transition border border-[#423C37] cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#EBD8B8]" />
              <span>Talk with Gemini</span>
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="p-4 rounded-2xl bg-[#FFF4F2] border border-[#FCDAD7] text-[#9A2D23] text-xs flex items-center justify-between">
          <span>{fetchError}</span>
          <button
            onClick={() => onNavigate('dashboard')}
            className="text-xs font-semibold underline text-[#85231A] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Insights Snapshot (4 Cards) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#8C857B]">
            Insights Snapshot
          </h2>
          <button
            onClick={() => onNavigate('insights')}
            className="text-xs font-medium text-[#57534E] hover:text-[#1C1917] flex items-center gap-1 transition cursor-pointer"
          >
            <span>View all insights</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat 1: Reflections */}
          <div className="p-5 rounded-2xl bg-white border border-[#EAE5DC] shadow-2xs hover:border-[#DBD2C1] transition">
            <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
              <span>Reflections</span>
              <BookOpen className="w-3.5 h-3.5 text-[#8C857B]" />
            </div>
            <div className="mt-3 text-2xl font-serif font-normal text-[#1C1917]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin text-[#8C857B]" /> : totalReflections}
            </div>
            <div className="mt-1 text-[11px] text-[#8C857B] font-light">Saved in your private journal</div>
          </div>

          {/* Stat 2: Conversations */}
          <div className="p-5 rounded-2xl bg-white border border-[#EAE5DC] shadow-2xs hover:border-[#DBD2C1] transition">
            <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
              <span>Conversations</span>
              <MessageSquare className="w-3.5 h-3.5 text-[#8C857B]" />
            </div>
            <div className="mt-3 text-2xl font-serif font-normal text-[#1C1917]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin text-[#8C857B]" /> : totalConversations}
            </div>
            <div className="mt-1 text-[11px] text-[#8C857B] font-light">Reflective dialogues with Gemini</div>
          </div>

          {/* Stat 3: Mood */}
          <div className="p-5 rounded-2xl bg-white border border-[#EAE5DC] shadow-2xs hover:border-[#DBD2C1] transition">
            <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
              <span>Overall Tone</span>
              <div className="shrink-0">{getMoodIcon(avgValence)}</div>
            </div>
            <div className="mt-3 text-lg font-serif font-normal text-[#1C1917] flex items-center gap-1.5 truncate">
              {loading ? <Loader2 className="w-4 h-4 animate-spin text-[#8C857B]" /> : getMoodLabel(avgValence)}
            </div>
            <div className="mt-1 text-[11px] text-[#8C857B] font-light">Synthesized from reflections</div>
          </div>

          {/* Stat 4: Topics */}
          <div className="p-5 rounded-2xl bg-white border border-[#EAE5DC] shadow-2xs hover:border-[#DBD2C1] transition">
            <div className="flex items-center justify-between text-[#8C857B] text-xs font-medium">
              <span>Themes Explored</span>
              <Tag className="w-3.5 h-3.5 text-[#8C857B]" />
            </div>
            <div className="mt-3 text-2xl font-serif font-normal text-[#1C1917]">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#8C857B]" />
              ) : totalTopicsCount > 0 ? (
                `${totalTopicsCount} themes`
              ) : (
                'Growing'
              )}
            </div>
            <div className="mt-1 text-[11px] text-[#8C857B] font-light">Patterns identified across time</div>
          </div>
        </div>
      </div>

      {/* 3. Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Reflections Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-serif font-normal text-[#1C1917] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#8C857B]" />
              <span>Recent Reflections</span>
            </h2>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-[#57534E] hover:text-[#1C1917] flex items-center gap-1 transition cursor-pointer"
            >
              <span>View full archive</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-white border border-[#EAE5DC] rounded-2xl divide-y divide-[#F2ECE1] overflow-hidden shadow-2xs">
            {loading ? (
              <div className="p-12 text-center text-[#8C857B] flex flex-col items-center justify-center gap-2.5">
                <Loader2 className="w-5 h-5 animate-spin text-[#8C857B]" />
                <span className="text-xs font-light">Loading your private reflections...</span>
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="p-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#EAE5DC] text-[#78716C] mx-auto flex items-center justify-center">
                  <Feather className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[#1C1917]">
                    You haven't written anything yet.
                  </h3>
                  <p className="text-xs text-[#78716C] max-w-sm mx-auto font-light leading-relaxed">
                    Start with whatever is on your mind. It doesn't need to be profound.
                  </p>
                </div>
                <button
                  id="empty-state-write-btn"
                  onClick={() => onNavigate('journal', 'reflect')}
                  className="px-5 py-2.5 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition cursor-pointer"
                >
                  Write your first reflection
                </button>
              </div>
            ) : (
              recentSessions.slice(0, 5).map((session) => {
                const matchedSummary = recentSummaries.find((s) => s.sessionId === session.id);
                const isChat = session.messages && session.messages.length > 0;
                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session, matchedSummary)}
                    className="p-5 sm:p-6 hover:bg-[#FAF8F5] transition duration-200 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1C1917] truncate font-serif">
                          {session.title || (isChat ? 'Conversation with Gemini' : 'Untitled Reflection')}
                        </span>
                        {session.mood && (
                          <span className="px-2 py-0.5 rounded-full bg-[#F4F0E8] text-[#57534E] text-[10px] font-medium shrink-0">
                            {session.mood}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#78716C] line-clamp-1 font-light leading-relaxed">
                        {session.content ||
                          (session.messages.length > 0 ? session.messages[0].text : 'No written content')}
                      </p>
                      <div className="text-[11px] text-[#A8A29E] pt-0.5 flex items-center gap-2 font-light">
                        <span>
                          {new Date(session.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {matchedSummary && (
                          <span className="text-[#4E775B] font-medium flex items-center gap-1">
                            • Reflection summary saved
                          </span>
                        )}
                      </div>
                    </div>

                    <ArrowUpRight className="w-4 h-4 text-[#A8A29E] group-hover:text-[#1C1917] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition shrink-0" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Thinking Companion, Prompt of Day, Privacy Note */}
        <div className="space-y-6">
          {/* Thinking Companion Card */}
          <div className="p-6 rounded-2xl bg-[#1C1917] text-[#FAF8F5] shadow-2xs border border-[#2B2724] space-y-3">
            <div className="flex items-center gap-2 text-[#EBD8B8] text-[11px] font-semibold uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Thinking Companion</span>
            </div>
            <h3 className="text-base font-serif font-normal text-white">
              Need to think something through?
            </h3>
            <p className="text-xs text-[#D6D0C4] leading-relaxed font-light">
              Talk it out with Gemini. Explore ideas, unpick difficult problems, or simply put your thoughts into words.
            </p>
            <div className="pt-1">
              <button
                id="gemini-section-start-btn"
                onClick={() => onNavigate('journal', 'chat')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FAF8F5] text-[#1C1917] text-xs font-semibold hover:bg-white transition cursor-pointer"
              >
                <span>Start conversation</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Prompt of the Day Card */}
          <div className="p-6 rounded-2xl bg-[#F8F5EE] border border-[#E8E1D3] shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-[#785E2F] text-[11px] font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#A87B32]" />
              <span>A little something to think about</span>
            </div>
            <p className="text-sm font-editorial italic text-[#3B342A] leading-relaxed">
              &ldquo;What is one quiet moment from today that brought you clarity, peace, or unexpected insight?&rdquo;
            </p>
            <div className="pt-1">
              <button
                id="prompt-reflect-cta-btn"
                onClick={() => onNavigate('journal', 'reflect')}
                className="text-xs font-medium text-[#785E2F] hover:text-[#523F1E] underline inline-flex items-center gap-1 cursor-pointer transition"
              >
                Reflect on this →
              </button>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="p-6 rounded-2xl bg-white border border-[#EAE5DC] shadow-2xs space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1C1917] flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#4E775B]" />
              <span>Your reflections are private</span>
            </h4>
            <div className="space-y-2 text-xs text-[#686256] leading-relaxed font-light">
              <p>
                Your journal is strictly protected and isolated to your account. Your writing remains private at all times.
              </p>
              <p>
                Gemini assists you server-side with reflections and personal summaries.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
