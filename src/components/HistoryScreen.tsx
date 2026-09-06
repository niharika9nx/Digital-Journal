/**
 * Screen 4: Conversation & Journal Reflection History
 * Filterable, searchable chronological archive of all private entries,
 * multi-turn chat sessions, and Gemini RAG summaries.
 */
import React, { useEffect, useState } from 'react';
import {
  Clock,
  Search,
  BookOpen,
  MessageSquare,
  Sparkles,
  Loader2,
  ChevronRight,
  AlertCircle,
  Tag,
  Smile,
  Feather,
} from 'lucide-react';
import type { JournalSession, JournalSummary, UserHistoryResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import { getHistory } from '../lib/api';
import { fetchHistoryFromFirestore } from '../lib/firebase';

interface HistoryScreenProps {
  onSelectSession: (session: JournalSession, summary?: JournalSummary) => void;
  onNewReflection: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  onSelectSession,
  onNewReflection,
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [summaries, setSummaries] = useState<JournalSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'entries' | 'conversations'>('all');
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [apiData, firestoreData] = await Promise.all([
        getHistory(user.idToken, 50, 'all').catch(() => ({ sessions: [], summaries: [] })),
        !user.isSandboxUser ? fetchHistoryFromFirestore(user.uid, 50) : Promise.resolve(null),
      ]);

      const apiSessions = (apiData as UserHistoryResponse).sessions || (apiData as UserHistoryResponse).entries || [];
      const apiSummaries = apiData.summaries || [];
      const fsSessions = firestoreData?.sessions || [];
      const fsSummaries = firestoreData?.summaries || [];

      const sessionMap = new Map<string, JournalSession>();
      [...fsSessions, ...apiSessions].forEach((s) => {
        if (s && s.id && !sessionMap.has(s.id)) sessionMap.set(s.id, s);
      });
      const loadedSessions = Array.from(sessionMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const summaryMap = new Map<string, JournalSummary>();
      [...fsSummaries, ...apiSummaries].forEach((sum) => {
        if (sum && sum.id && !summaryMap.has(sum.id)) summaryMap.set(sum.id, sum);
      });
      const loadedSummaries = Array.from(summaryMap.values());

      setSessions(loadedSessions);
      setSummaries(loadedSummaries);
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  // Filter sessions by search term and filter type
  const filteredSessions = sessions.filter((s) => {
    const isChat = s.messages && s.messages.length > 0;
    if (filterType === 'entries' && isChat) return false;
    if (filterType === 'conversations' && !isChat) return false;

    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    const titleMatch = s.title?.toLowerCase().includes(query);
    const contentMatch = s.content?.toLowerCase().includes(query);
    const moodMatch = s.mood?.toLowerCase().includes(query);
    const tagsMatch = s.tags?.some((t) => t.toLowerCase().includes(query));
    const messagesMatch = s.messages?.some((m) => m.text.toLowerCase().includes(query));

    return titleMatch || contentMatch || moodMatch || tagsMatch || messagesMatch;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & New Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DC] pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#8C857B] font-medium">
            <Clock className="w-3.5 h-3.5 text-[#8C857B]" />
            <span>Chronological Archives</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-normal text-[#1C1917] tracking-tight">
            Your Journal Archive
          </h2>
          <p className="text-xs sm:text-sm text-[#78716C] font-light leading-relaxed">
            Browse and search through all past reflections, thoughts, and companion conversations.
          </p>
        </div>

        <button
          onClick={onNewReflection}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition shadow-2xs cursor-pointer self-start sm:self-auto"
        >
          <Feather className="w-3.5 h-3.5 text-[#EBD8B8]" />
          <span>New Reflection</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-[#FFF4F2] border border-[#FCDAD7] text-[#9A2D23] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#9A2D23] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchHistory}
            className="text-xs font-semibold underline text-[#85231A] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8C857B] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            id="history-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search keywords, themes, mood, or tags..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-[#EAE5DC] bg-white text-sm text-[#1C1917] focus:outline-hidden focus:ring-1 focus:ring-[#8C857B] placeholder:text-[#A8A29E] font-light transition shadow-2xs"
          />
        </div>

        <div className="flex rounded-full bg-[#EDE8DF] p-1 self-start sm:self-auto border border-[#E0D8CB]">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
              filterType === 'all'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            onClick={() => setFilterType('entries')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
              filterType === 'entries'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            Reflections
          </button>
          <button
            onClick={() => setFilterType('conversations')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
              filterType === 'conversations'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            Chat Threads
          </button>
        </div>
      </div>

      {/* List Archive */}
      <div className="bg-white rounded-3xl border border-[#EAE5DC] divide-y divide-[#F2ECE1] overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-[#8C857B] flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#8C857B]" />
            <span className="text-xs font-light">Loading archive records...</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#EAE5DC] text-[#8C857B] mx-auto flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <p className="text-sm font-serif font-medium text-[#1C1917]">No records found</p>
            <p className="text-xs text-[#78716C] max-w-sm mx-auto font-light">
              {searchTerm ? 'Try adjusting your search keywords.' : 'No reflections or chats recorded yet in your account.'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isChat = session.messages && session.messages.length > 0;
            const matchedSummary = summaries.find((s) => s.sessionId === session.id);

            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session, matchedSummary)}
                className="p-5 sm:p-6 hover:bg-[#FAF8F5] transition duration-200 cursor-pointer flex items-center justify-between group"
              >
                <div className="min-w-0 pr-4 space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-serif font-normal text-[#1C1917] truncate">
                      {session.title || (isChat ? 'AI Companion Conversation' : 'Untitled Reflection')}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                        isChat
                          ? 'bg-[#EDE8DF] text-[#57534E] border border-[#E0D8CB]'
                          : 'bg-[#F4F0E8] text-[#785E2F] border border-[#E8E1D3]'
                      }`}
                    >
                      {isChat ? (
                        <>
                          <MessageSquare className="w-3 h-3 text-[#57534E]" />
                          <span>Chat ({session.messages.length} turns)</span>
                        </>
                      ) : (
                        <>
                          <BookOpen className="w-3 h-3 text-[#A87B32]" />
                          <span>Reflection</span>
                        </>
                      )}
                    </span>

                    {session.mood && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#FAF8F5] text-[#57534E] border border-[#EAE5DC] text-[10px] font-medium flex items-center gap-1">
                        <Smile className="w-3 h-3 text-[#8C857B]" />
                        <span>{session.mood}</span>
                      </span>
                    )}

                    {matchedSummary && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#EBF2ED] text-[#4E775B] border border-[#D5E3D8] text-[10px] font-medium flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-[#4E775B]" />
                        <span>Summary Saved</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#78716C] line-clamp-2 leading-relaxed font-light">
                    {session.content ||
                      (isChat
                        ? session.messages.map((m) => `${m.role === 'user' ? 'You' : 'Gemini'}: ${m.text}`).join(' • ')
                        : 'No written content')}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#A8A29E] pt-0.5 font-light">
                    <span>
                      {new Date(session.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {session.tags && session.tags.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-[#8C857B]" />
                        {session.tags.map((tag) => (
                          <span key={tag} className="text-[#78716C] text-[10px]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-[#A8A29E] group-hover:text-[#1C1917] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
