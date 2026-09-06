/**
 * Client-Side Gemini AI Conversation & Synthesis Service
 * Provides client-side fallback processing when running purely on Firebase Hosting (Spark Free Tier)
 * without requiring a billed Cloud Run backend container.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { JournalSummary } from '../types';

let aiClient: GoogleGenAI | null = null;

function getClientGemini(): GoogleGenAI | null {
  if (!aiClient) {
    // Check for client-side API key if configured
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (window as any).__GEMINI_API_KEY__;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '') {
      aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return aiClient;
}

const SYSTEM_INSTRUCTION_CHAT = `You are the Personal Gemini Journal reflective companion.
Your primary role is to provide empathetic, thoughtful, supportive, and non-judgmental guidance, helping the user explore their daily thoughts, personal growth, emotional patterns, and well-being.
Keep your voice warm, grounded, perceptive, and concise. Encourage personal mindfulness and healthy self-reflection.`;

/**
 * Generates an empathetic conversational response to the user's reflection turn
 */
export async function clientGenerateChatResponse(
  userMessage: string,
  previousHistory: { role: 'user' | 'model'; text: string }[] = [],
  historicalSummaries: JournalSummary[] = []
): Promise<{ text: string; retrievedSummaryCount: number }> {
  const ai = getClientGemini();
  const summaryCount = historicalSummaries.length;

  if (!ai) {
    // Intelligent heuristic response when no direct client key is present
    const greetings = [
      "Thank you for sharing your thoughts with me. Taking a moment to write them down is a meaningful step toward clarity.",
      "I hear you. Reflecting openly on your day helps bring balance and mindfulness to what you're experiencing.",
      "I appreciate you opening up. What part of this experience feels most significant to you right now?",
    ];
    const picked = greetings[Math.floor(Math.random() * greetings.length)];
    return { text: picked, retrievedSummaryCount: summaryCount };
  }

  try {
    const contents: any[] = [];
    for (const turn of previousHistory.slice(-6)) {
      contents.push({
        role: turn.role,
        parts: [{ text: turn.text }],
      });
    }

    let prompt = userMessage;
    if (historicalSummaries.length > 0) {
      const context = historicalSummaries
        .slice(0, 3)
        .map((s, i) => `[Prior Reflection ${i + 1}: ${s.mood || 'Reflective'}] ${s.summaryText}`)
        .join('\n');
      prompt = `Context from past reflections:\n${context}\n\nCurrent message:\n${userMessage}`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_CHAT,
        temperature: 0.7,
      },
    });

    return {
      text: response.text?.trim() || "Thank you for reflecting with me today.",
      retrievedSummaryCount: summaryCount,
    };
  } catch (err) {
    console.warn('[Client Gemini] Chat fallback:', err);
    return {
      text: "I am holding space for your reflection. Your words and insights are safely recorded in your private journal.",
      retrievedSummaryCount: summaryCount,
    };
  }
}

/**
 * Generates an objective, structured summary of a journal entry with emotional valence scoring
 */
export async function clientGenerateEntrySummary(
  content: string,
  title?: string,
  mood?: string
): Promise<{ summaryText: string; keyThemes: string[]; emotionalValence: number; mood: string }> {
  const sanitizedTitle = title || 'Daily Reflection';
  const sanitizedMood = mood || 'Reflective';
  const words = content.trim().split(/\s+/);

  const ai = getClientGemini();
  if (!ai) {
    // High-quality local heuristic summary
    const excerpt = words.slice(0, 25).join(' ') + (words.length > 25 ? '...' : '');
    
    // Simple sentiment heuristic
    const positiveWords = ['happy', 'grateful', 'great', 'peace', 'joy', 'good', 'love', 'inspired', 'productive', 'calm', 'hope', 'proud'];
    const negativeWords = ['sad', 'anxious', 'stress', 'tired', 'angry', 'overwhelmed', 'difficult', 'hard', 'struggle', 'fatigue', 'bad'];
    
    let score = 0.1;
    const lower = content.toLowerCase();
    positiveWords.forEach(w => { if (lower.includes(w)) score += 0.15; });
    negativeWords.forEach(w => { if (lower.includes(w)) score -= 0.15; });
    const emotionalValence = Math.max(-1, Math.min(1, Number(score.toFixed(2))));

    // Extract tags/themes from common themes
    const themes = ['Personal Growth', sanitizedMood];
    if (lower.includes('work') || lower.includes('project') || lower.includes('study')) themes.push('Career & Focus');
    if (lower.includes('family') || lower.includes('friend') || lower.includes('relationship')) themes.push('Relationships');
    if (lower.includes('health') || lower.includes('walk') || lower.includes('sleep') || lower.includes('exercise')) themes.push('Wellness');
    if (lower.includes('goal') || lower.includes('future') || lower.includes('plan')) themes.push('Aspirations');

    return {
      summaryText: `Explored thoughts regarding ${sanitizedTitle.toLowerCase()}: ${excerpt}`,
      keyThemes: themes.slice(0, 4),
      emotionalValence,
      mood: sanitizedMood,
    };
  }

  try {
    const prompt = `Analyze this personal journal reflection and provide a structured JSON response:
Title: ${sanitizedTitle}
Mood: ${sanitizedMood}
Content:
"""
${content}
"""`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryText: { type: Type.STRING, description: 'Dense 2-3 sentence summary' },
            keyThemes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key themes or topics in the reflection',
            },
            emotionalValence: {
              type: Type.NUMBER,
              description: 'Float between -1.0 and 1.0 representing emotional valence',
            },
            mood: { type: Type.STRING, description: 'Overall mood classification' },
          },
          required: ['summaryText', 'keyThemes', 'emotionalValence', 'mood'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      summaryText: parsed.summaryText || `Reflected on ${sanitizedTitle}`,
      keyThemes: Array.isArray(parsed.keyThemes) && parsed.keyThemes.length > 0 ? parsed.keyThemes : ['Reflection'],
      emotionalValence: typeof parsed.emotionalValence === 'number' ? parsed.emotionalValence : 0.1,
      mood: parsed.mood || sanitizedMood,
    };
  } catch (err) {
    console.warn('[Client Gemini] Summary synthesis fallback:', err);
    return {
      summaryText: `Personal reflection on: ${sanitizedTitle}`,
      keyThemes: ['Daily Reflection', sanitizedMood],
      emotionalValence: 0.1,
      mood: sanitizedMood,
    };
  }
}
