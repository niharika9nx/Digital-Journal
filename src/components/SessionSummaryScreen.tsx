/**
 * Screen 5: Session Summary & Gemini Synthesis Inspector
 * Detailed breakdown of a specific reflection or chat session, highlighting the
 * reflection summary, mood analysis, key themes, and full text.
 */
import React from 'react';
import {
  ArrowLeft,
  Sparkles,
  BookOpen,
  MessageSquare,
  Tag,
  ShieldCheck,
  Smile,
  Meh,
  Frown,
  Calendar,
  MessageCircle,
} from 'lucide-react';
import type { JournalSession, JournalSummary } from '../types';

interface SessionSummaryScreenProps {
  session: JournalSession;
  summary?: JournalSummary;
  onBack: () => void;
  onFollowUpChat: (session: JournalSession) => void;
}

export const SessionSummaryScreen: React.FC<SessionSummaryScreenProps> = ({
  session,
  summary,
  onBack,
  onFollowUpChat,
}) => {
  const isChat = session.messages && session.messages.length > 0;
  const valence = summary?.emotionalValence ?? 0;

  // Convert valence (-1.0 to 1.0) into a percentage (0% to 100%)
  const valencePercentage = Math.round(((valence + 1) / 2) * 100);

  const getMoodLabel = (val: number, fallbackMood?: string) => {
    if (fallbackMood) return fallbackMood;
    if (val > 0.3) return 'Uplifting & Positive';
    if (val > 0.05) return 'Gently Optimistic';
    if (val < -0.3) return 'Working Through Thoughts';
    if (val < -0.05) return 'Contemplative & Deep';
    return 'Balanced';
  };

  const getMoodIcon = (val: number) => {
    if (val > 0.2) return <Smile className="w-5 h-5 text-[#4E775B]" />;
    if (val < -0.2) return <Frown className="w-5 h-5 text-[#B85D54]" />;
    return <Meh className="w-5 h-5 text-[#A87B32]" />;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] hover:text-[#1C1917] transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to archive</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-[#EAE5DC] shadow-2xs overflow-hidden divide-y divide-[#F2ECE1]">
        {/* Header Section */}
        <div className="p-6 sm:p-9 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-medium ${
                isChat
                  ? 'bg-[#EDE8DF] text-[#57534E] border border-[#E0D8CB]'
                  : 'bg-[#F4F0E8] text-[#785E2F] border border-[#E8E1D3]'
              }`}
            >
              {isChat ? <MessageSquare className="w-3 h-3 text-[#57534E]" /> : <BookOpen className="w-3 h-3 text-[#A87B32]" />}
              <span>{isChat ? 'Conversation' : 'Reflection'}</span>
            </span>

            {session.mood && (
              <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-[#FAF8F5] text-[#57534E] border border-[#EAE5DC] text-[11px] font-medium">
                <Smile className="w-3 h-3 text-[#8C857B]" />
                <span>{session.mood}</span>
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-normal text-[#1C1917] tracking-tight">
            {session.title || (isChat ? 'Conversation with Gemini' : 'Untitled Reflection')}
          </h1>

          <div className="flex items-center gap-3 text-xs text-[#8C857B] font-light">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#A8A29E]" />
              <span>
                {new Date(session.createdAt).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          </div>
        </div>

        {/* AI Synthesis & Mood */}
        <div className="p-6 sm:p-9 bg-[#FAF8F5] space-y-6">
          <div className="flex items-center gap-2 text-[#1C1917] font-serif text-sm">
            <Sparkles className="w-4 h-4 text-[#A87B32]" />
            <span>Reflective Synthesis & Insights</span>
          </div>

          {summary ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Summary Text (2 cols) */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#8C857B] mb-2">
                    Synthesis
                  </h4>
                  <p className="text-sm text-[#3B342A] leading-relaxed bg-white p-5 rounded-2xl border border-[#EAE5DC] shadow-2xs font-light">
                    {summary.summaryText}
                  </p>
                </div>

                {/* Key Themes */}
                {summary.keyThemes && summary.keyThemes.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#8C857B] mb-2 flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-[#8C857B]" />
                      <span>Key Themes</span>
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {summary.keyThemes.map((theme, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-full bg-white border border-[#E0D8CB] text-xs font-medium text-[#57534E] shadow-2xs"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mood Meter (1 col) */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#EAE5DC] shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#8C857B] mb-2">
                    Emotional Tone
                  </h4>
                  <div className="flex items-center gap-2">
                    {getMoodIcon(valence)}
                    <span className="text-base font-serif font-medium text-[#1C1917]">
                      {getMoodLabel(valence, summary.mood)}
                    </span>
                  </div>
                </div>

                {/* Visual meter */}
                <div className="space-y-1.5 pt-2 border-t border-[#F2ECE1]">
                  <div className="flex justify-between text-[10px] text-[#8C857B] font-light">
                    <span>Working through</span>
                    <span>Balanced</span>
                    <span>Uplifted</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#EDE8DF] relative overflow-hidden">
                    <div
                      className="h-full bg-[#1C1917] rounded-full transition-all duration-500"
                      style={{ width: `${valencePercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-white border border-[#EAE5DC] text-[#78716C] text-xs flex items-center gap-2.5 font-light">
              <Sparkles className="w-4 h-4 text-[#A87B32] shrink-0" />
              <span>
                Reflective insights and theme analyses are created upon saving new journal reflections.
              </span>
            </div>
          )}
        </div>

        {/* Content Section: Reflection Text or Chat Stream */}
        <div className="p-6 sm:p-9 space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#8C857B]">
            {isChat ? 'Conversation Transcript' : 'Journal Content'}
          </h3>

          {session.content ? (
            <div className="text-sm sm:text-base text-[#1C1917] whitespace-pre-wrap leading-relaxed bg-[#FAF8F5] p-6 rounded-2xl border border-[#EAE5DC] font-serif">
              {session.content}
            </div>
          ) : isChat ? (
            <div className="space-y-3">
              {session.messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#1C1917] text-[#FAF8F5] ml-6 rounded-tr-none'
                      : 'bg-[#FAF8F5] text-[#1C1917] mr-6 rounded-tl-none border border-[#EAE5DC] font-light'
                  }`}
                >
                  <span className="font-semibold block mb-1 text-[10px] uppercase tracking-wider opacity-70">
                    {m.role === 'user' ? 'You' : 'Gemini'}
                  </span>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#A8A29E] italic">No text recorded.</div>
          )}

          {/* Tags */}
          {session.tags && session.tags.length > 0 && (
            <div className="flex items-center gap-2 pt-3">
              <span className="text-xs text-[#8C857B] font-light">Tags:</span>
              <div className="flex flex-wrap gap-1.5">
                {session.tags.map((t) => (
                  <span key={t} className="px-2.5 py-0.5 rounded-full bg-[#FAF8F5] border border-[#EAE5DC] text-[#57534E] text-xs">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 sm:p-8 bg-[#FAF8F5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[#78716C] font-light">
            <ShieldCheck className="w-4 h-4 text-[#4E775B] shrink-0" />
            <span>Securely saved in your private journal</span>
          </div>

          <button
            onClick={() => onFollowUpChat(session)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition shadow-2xs cursor-pointer self-start sm:self-auto"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#EBD8B8]" />
            <span>Talk with Gemini about this reflection</span>
          </button>
        </div>
      </div>
    </div>
  );
};
