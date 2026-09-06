/**
 * Screen 3: Journal Reflection & AI Companion Interface
 * Dual-mode interface:
 * 1. Deep Journal Writing (Title, Mood, Tags, Content -> Reflection Summary & Mood)
 * 2. Mindful Conversation with Gemini (Context-aware discussion grounded in past reflections)
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  MessageSquare,
  Sparkles,
  Send,
  Loader2,
  Tag,
  Smile,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Feather,
} from 'lucide-react';
import type { JournalSession, JournalSummary } from '../types';
import { useAuth } from '../context/AuthContext';
import { postSummarize, postChat } from '../lib/api';
import { syncSessionToFirestore, syncSummaryToFirestore } from '../lib/firebase';

interface JournalChatScreenProps {
  initialMode?: 'reflect' | 'chat';
  onSummaryGenerated: (session: JournalSession, summary: JournalSummary) => void;
}

const PRESET_MOODS = [
  'Grateful',
  'Peaceful',
  'Reflective',
  'Productive',
  'Inspired',
  'Contemplative',
  'Anxious',
  'Fatigued',
];

export const JournalChatScreen: React.FC<JournalChatScreenProps> = ({
  initialMode = 'reflect',
  onSummaryGenerated,
}) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<'reflect' | 'chat'>(initialMode);

  // Reflection state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedMood, setSelectedMood] = useState('Reflective');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmittingReflection, setIsSubmittingReflection] = useState(false);
  const [reflectionError, setReflectionError] = useState<string | null>(null);

  // Chat state
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    {
      role: 'model',
      text: "Hello. I am here to help you reflect, brainstorm, or explore whatever is on your mind. How are you feeling today?",
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastRagCount, setLastRagCount] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, mode]);

  // Handle adding tags
  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().replace(/^#/, '');
      if (clean && !tags.includes(clean) && tags.length < 10) {
        setTags([...tags, clean]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Submit journal reflection for Gemini summarization and Firestore persistence
  const handleSaveReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanContent = content.trim();
    const cleanTitle = title.trim();

    if (!cleanContent) {
      console.warn('[Journal Entry] Save aborted: reflection content is empty.');
      return;
    }
    if (!user) {
      console.error('[Journal Entry] Save aborted: user authentication is missing.');
      return;
    }

    console.group('📝 [Journal Entry Component] Saving New Reflection');
    console.info('Timestamp:', new Date().toISOString());
    console.log('User Context:', {
      uid: user.uid,
      email: user.email,
      isSandbox: user.isSandboxUser,
      tokenPresent: !!user.idToken,
    });
    console.log('Reflection Input Data:', {
      title: cleanTitle || '(Untitled)',
      characterCount: cleanContent.length,
      wordCount: cleanContent.split(/\s+/).length,
      selectedMood,
      tags,
    });

    setIsSubmittingReflection(true);
    setReflectionError(null);

    try {
      console.info('📡 [Journal Entry] Requesting AI summarization and server storage...');
      const result = await postSummarize(user.idToken, {
        content: cleanContent,
        title: cleanTitle || undefined,
        mood: selectedMood,
        tags: tags.length > 0 ? tags : undefined,
      });

      console.log('✅ [Journal Entry] Summarization received successfully:', {
        sessionId: result.entry?.id,
        summaryId: result.summary?.id,
        summaryMood: result.summary?.mood,
        keyThemes: result.summary?.keyThemes,
      });

      // Synchronize directly into Cloud Firestore database /users/{uid}/...
      if (!user.isSandboxUser) {
        console.info(
          `💾 [Journal Entry] Commencing Firestore write operations to collection /users/${user.uid}/...`
        );

        const [sessionWriteResult, summaryWriteResult] = await Promise.allSettled([
          syncSessionToFirestore(user.uid, result.entry),
          syncSummaryToFirestore(user.uid, result.summary),
        ]);

        // Evaluate Session Write
        if (sessionWriteResult.status === 'fulfilled') {
          if (sessionWriteResult.value.success) {
            console.info(`✅ [Firestore Sync] Session ${result.entry.id} verified in Firestore.`);
          } else {
            console.info(`ℹ️ [Storage Note] Session stored via authenticated API.`);
          }
        }

        // Evaluate Summary Write
        if (summaryWriteResult.status === 'fulfilled') {
          if (summaryWriteResult.value.success) {
            console.info(`✅ [Firestore Sync] Summary ${result.summary.id} verified in Firestore.`);
          } else {
            console.info(`ℹ️ [Storage Note] Summary stored via authenticated API.`);
          }
        }
      } else {
        console.info(
          `ℹ️ [Journal Entry] Sandbox/Dev Account mode (${user.uid}). Saved in server memory.`
        );
      }

      // Clear input fields
      setTitle('');
      setContent('');
      setTags([]);

      console.info('🎉 [Journal Entry] Reflection save flow completed successfully.');
      console.groupEnd();

      // Notify parent to open summary inspector
      onSummaryGenerated(result.entry, result.summary);
    } catch (err: any) {
      console.error('❌ [Journal Entry Component] Error saving reflection:', {
        message: err.message,
        stack: err.stack,
      });
      console.groupEnd();
      setReflectionError(err.message || 'Failed to save reflection.');
    } finally {
      setIsSubmittingReflection(false);
    }
  };

  // Send message to Gemini Companion
  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanMsg = inputMessage.trim();
    if (!cleanMsg || !user || isSendingChat) return;

    // Optimistically append user message
    const updatedMessages = [...chatMessages, { role: 'user' as const, text: cleanMsg }];
    setChatMessages(updatedMessages);
    setInputMessage('');
    setIsSendingChat(true);
    setChatError(null);

    try {
      const response = await postChat(user.idToken, cleanMsg, conversationId);
      const activeConvId = conversationId || response.conversationId;
      if (!conversationId) {
        setConversationId(response.conversationId);
      }
      setLastRagCount(response.retrievedSummaryCount);

      const finalMessages = [...updatedMessages, { role: 'model' as const, text: response.reply }];
      setChatMessages(finalMessages);

      // Synchronize conversation into Cloud Firestore
      if (!user.isSandboxUser && activeConvId) {
        const now = new Date().toISOString();
        syncSessionToFirestore(user.uid, {
          id: activeConvId,
          uid: user.uid,
          title: 'Conversation with Gemini',
          messages: finalMessages.map((m) => ({ ...m, timestamp: now })),
          createdAt: now,
          updatedAt: now,
        }).catch((err) => console.warn('Chat Firestore sync notice:', err));
      }
    } catch (err: any) {
      setChatError(err.message || 'Failed to communicate with Gemini.');
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleStartNewChat = () => {
    setConversationId(undefined);
    setLastRagCount(null);
    setChatMessages([
      {
        role: 'model',
        text: "Started a fresh conversation. I'm here to listen and help you explore your thoughts. What's on your mind?",
      },
    ]);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DC] pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#8C857B] font-medium">
            <Feather className="w-3.5 h-3.5 text-[#A87B32]" />
            <span>{mode === 'reflect' ? 'Journal Entry' : 'Reflective Dialogue'}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-normal text-[#1C1917] tracking-tight">
            {mode === 'reflect' ? 'Write a Reflection' : 'Talk with Gemini'}
          </h2>
          <p className="text-xs sm:text-sm text-[#78716C] font-light leading-relaxed">
            {mode === 'reflect'
              ? "Capture your thoughts freely. Gemini will gently reflect themes and emotional tone upon saving."
              : 'Have a thoughtful, private conversation grounded in your reflections.'}
          </p>
        </div>

        <div className="flex rounded-full bg-[#EDE8DF] p-1 self-start sm:self-auto border border-[#E0D8CB]">
          <button
            id="tab-reflect-mode"
            onClick={() => setMode('reflect')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
              mode === 'reflect'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Write</span>
          </button>
          <button
            id="tab-chat-mode"
            onClick={() => setMode('chat')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
              mode === 'chat'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Reflect / Write Interface */}
      {mode === 'reflect' && (
        <form onSubmit={handleSaveReflection} className="space-y-6">
          {reflectionError && (
            <div className="p-4 rounded-2xl bg-[#FFF4F2] border border-[#FCDAD7] text-[#9A2D23] text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#9A2D23] mt-0.5 shrink-0" />
              <div className="flex-1 space-y-0.5">
                <p className="font-semibold text-xs">Could not save reflection</p>
                <p className="text-xs opacity-90">{reflectionError}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-[#EAE5DC] p-6 sm:p-8 shadow-2xs space-y-6">
            {/* Title & Mood */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-xs font-medium text-[#57534E]">
                  Reflection Title <span className="text-[#A8A29E] font-normal">(Optional)</span>
                </label>
                <input
                  id="journal-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Morning clarity and new perspectives"
                  maxLength={150}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#8C857B] text-sm text-[#1C1917] placeholder:text-[#A8A29E] transition font-serif"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#57534E] flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-[#8C857B]" />
                  <span>Dominant Mood</span>
                </label>
                <select
                  id="journal-mood-select"
                  value={selectedMood}
                  onChange={(e) => setSelectedMood(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#8C857B] text-sm text-[#1C1917] transition cursor-pointer"
                >
                  {PRESET_MOODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <label className="block text-xs font-medium text-[#57534E]">
                  Your Thoughts & Reflections <span className="text-[#B85D54]">*</span>
                </label>
                <span className="text-[11px] text-[#A8A29E] font-mono">
                  {wordCount} {wordCount === 1 ? 'word' : 'words'}
                </span>
              </div>
              <textarea
                id="journal-content-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={11}
                required
                placeholder="What occurred today? What thoughts or sensations surfaced? Write freely without judging your words..."
                className="w-full p-5 rounded-2xl border border-[#EAE5DC] bg-[#FAF8F5] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#8C857B] text-sm sm:text-base leading-relaxed text-[#1C1917] placeholder:text-[#A8A29E] font-light resize-y min-h-[240px] transition"
              />
            </div>

            {/* Tags Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#57534E] flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#8C857B]" />
                <span>Tags</span>
                <span className="text-[#A8A29E] font-normal">(Press Enter or comma to add)</span>
              </label>
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5]">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-[#E0D8CB] text-xs font-medium text-[#57534E] shadow-2xs"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-[#A8A29E] hover:text-[#1C1917] font-bold ml-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {tags.length < 10 && (
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder={tags.length === 0 ? 'Type a tag and press Enter...' : 'Add another tag...'}
                    className="flex-1 min-w-[140px] bg-transparent border-none focus:outline-hidden text-xs py-1 text-[#1C1917] placeholder:text-[#A8A29E]"
                  />
                )}
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#F2ECE1]">
              <div className="text-[11px] text-[#78716C] flex items-center gap-2 font-light">
                <Sparkles className="w-3.5 h-3.5 text-[#A87B32] shrink-0" />
                <span>Gemini will provide a calm summary and emotional synthesis</span>
              </div>

              <button
                id="save-reflection-submit-btn"
                type="submit"
                disabled={isSubmittingReflection || !content.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs sm:text-sm font-medium hover:bg-[#2B2724] disabled:opacity-50 transition shadow-2xs cursor-pointer"
              >
                {isSubmittingReflection ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Synthesizing Reflection...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#EBD8B8]" />
                    <span>Save Reflection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Mode 2: Conversational Chat Interface */}
      {mode === 'chat' && (
        <div className="space-y-4">
          {/* Chat Controls & context badge */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              {lastRagCount !== null && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F0E8] border border-[#E0D8CB] text-[#57534E] text-xs font-medium">
                  <Sparkles className="w-3 h-3 text-[#A87B32]" />
                  <span>Referencing {lastRagCount} past {lastRagCount === 1 ? 'reflection' : 'reflections'}</span>
                </span>
              )}
            </div>

            <button
              onClick={handleStartNewChat}
              className="inline-flex items-center gap-1.5 text-xs text-[#57534E] hover:text-[#1C1917] transition font-medium cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Start New Thread</span>
            </button>
          </div>

          {chatError && (
            <div className="p-4 rounded-2xl bg-[#FFF4F2] border border-[#FCDAD7] text-[#9A2D23] text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#9A2D23] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium">{chatError}</p>
              </div>
            </div>
          )}

          {/* Messages Stream Container */}
          <div className="bg-white rounded-3xl border border-[#EAE5DC] p-5 sm:p-7 shadow-2xs h-[500px] overflow-y-auto space-y-4 flex flex-col">
            {chatMessages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
                      isUser
                        ? 'bg-[#1C1917] text-[#FAF8F5]'
                        : 'bg-[#F4F0E8] text-[#57534E] border border-[#E0D8CB]'
                    }`}
                  >
                    {isUser ? 'You' : <Sparkles className="w-3.5 h-3.5 text-[#A87B32]" />}
                  </div>

                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#1C1917] text-[#FAF8F5] rounded-tr-none'
                        : 'bg-[#FAF8F5] text-[#1C1917] rounded-tl-none border border-[#EAE5DC] font-light'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              );
            })}

            {isSendingChat && (
              <div className="flex gap-3 max-w-[85%] mr-auto items-center">
                <div className="w-7 h-7 rounded-full bg-[#F4F0E8] text-[#57534E] border border-[#E0D8CB] flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-[#A87B32] animate-pulse" />
                </div>
                <div className="p-3.5 rounded-2xl rounded-tl-none bg-[#FAF8F5] text-[#78716C] text-xs flex items-center gap-2 border border-[#EAE5DC]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8C857B]" />
                  <span>Gemini is reflecting...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Field */}
          <form onSubmit={handleSendChatMessage} className="relative">
            <input
              id="chat-message-input"
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask a reflective question or explore an idea..."
              disabled={isSendingChat}
              className="w-full pl-5 pr-14 py-4 rounded-2xl border border-[#EAE5DC] bg-white focus:outline-hidden focus:ring-1 focus:ring-[#8C857B] text-sm text-[#1C1917] shadow-2xs placeholder:text-[#A8A29E] transition font-light"
            />
            <button
              id="chat-send-btn"
              type="submit"
              disabled={isSendingChat || !inputMessage.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-[#1C1917] text-[#FAF8F5] hover:bg-[#2B2724] disabled:opacity-30 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center gap-1.5 text-[11px] text-[#8C857B] justify-center font-light pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#4E775B]" />
            <span>Your reflections and conversations are completely private.</span>
          </div>
        </div>
      )}
    </div>
  );
};
