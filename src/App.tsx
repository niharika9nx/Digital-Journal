/**
 * Application Entry & Navigation Router
 * Orchestrates all 7 screens under Zero-Trust Authentication and Session Management:
 * 1. Google Sign-In
 * 2. Dashboard
 * 3. Journal & AI Chat Interface
 * 4. Conversation History
 * 5. Session Summary
 * 6. Profile & Security Settings
 * 7. Insights Dashboard
 */
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { ScreenType, JournalSession, JournalSummary } from './types';
import { Navbar } from './components/Navbar';
import { GoogleSignInScreen } from './components/GoogleSignInScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { JournalChatScreen } from './components/JournalChatScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { SessionSummaryScreen } from './components/SessionSummaryScreen';
import { ProfileSettingsScreen } from './components/ProfileSettingsScreen';
import { InsightsScreen } from './components/InsightsScreen';
import { SessionExpiredModal } from './components/SessionExpiredModal';
import { Loader2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('dashboard');
  const [selectedSession, setSelectedSession] = useState<JournalSession | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<JournalSummary | undefined>(undefined);
  const [journalInitialMode, setJournalInitialMode] = useState<'reflect' | 'chat'>('reflect');

  // Loading state during auth determination
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] bg-paper-pattern flex flex-col items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-4 max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#1C1917] text-[#EBD8B8] flex items-center justify-center shadow-xs">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-lg font-normal text-[#1C1917]">Personal Gemini Journal</h2>
            <p className="text-xs text-[#78716C] font-light tracking-wide">Opening your private space...</p>
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated, present Screen 1: Google Sign-In
  if (!user) {
    return (
      <>
        <GoogleSignInScreen />
        <SessionExpiredModal />
      </>
    );
  }

  // Handlers for cross-screen transitions
  const handleSelectSession = (session: JournalSession, summary?: JournalSummary) => {
    setSelectedSession(session);
    setSelectedSummary(summary);
    setCurrentScreen('summary');
  };

  const handleSummaryGenerated = (session: JournalSession, summary: JournalSummary) => {
    setSelectedSession(session);
    setSelectedSummary(summary);
    setCurrentScreen('summary');
  };

  const handleFollowUpChat = (_session: JournalSession) => {
    setJournalInitialMode('chat');
    setCurrentScreen('journal');
  };

  const handleNavigate = (screen: ScreenType) => {
    if (screen === 'journal') {
      setJournalInitialMode('reflect');
    }
    setCurrentScreen(screen);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-paper-pattern text-[#1C1917] flex flex-col font-sans selection:bg-[#EBD8B8] selection:text-[#1C1917]">
      <Navbar currentScreen={currentScreen} onNavigate={handleNavigate} />

      <main className="flex-1 pb-20">
        {currentScreen === 'dashboard' && (
          <DashboardScreen
            onNavigate={handleNavigate}
            onSelectSession={handleSelectSession}
          />
        )}

        {currentScreen === 'journal' && (
          <JournalChatScreen
            initialMode={journalInitialMode}
            onSummaryGenerated={handleSummaryGenerated}
          />
        )}

        {currentScreen === 'history' && (
          <HistoryScreen
            onSelectSession={handleSelectSession}
            onNewReflection={() => {
              setJournalInitialMode('reflect');
              setCurrentScreen('journal');
            }}
          />
        )}

        {currentScreen === 'summary' && selectedSession && (
          <SessionSummaryScreen
            session={selectedSession}
            summary={selectedSummary}
            onBack={() => setCurrentScreen('history')}
            onFollowUpChat={handleFollowUpChat}
          />
        )}

        {currentScreen === 'insights' && <InsightsScreen />}

        {currentScreen === 'profile' && <ProfileSettingsScreen />}
      </main>

      <SessionExpiredModal />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
