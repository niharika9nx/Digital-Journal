/**
 * Screen 1: Google Sign-In & Authentication Gateway
 * - Authenticates using Firebase Auth (Google Provider popup)
 * - Obtains genuine Firebase ID Token for backend API authorization
 * - Provides sandbox development profiles for zero-cookie iframe environments
 * - Explains the Zero-Trust security guarantees
 */
import React, { useState } from 'react';
import { ShieldCheck, Sparkles, Lock, ArrowRight, CheckCircle2, AlertCircle, BookOpen, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const GoogleSignInScreen: React.FC = () => {
  const { signInWithGoogle, signInWithSandbox, loading, error, clearError } = useAuth();
  const [activeTab, setActiveTab] = useState<'google' | 'sandbox'>('google');

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleSandboxSignIn = async (uid: string, email: string, name: string) => {
    try {
      await signInWithSandbox(uid, email, name);
    } catch {
      // Error handled by AuthContext
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-paper-pattern flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1C1917] text-[#FAF8F5] shadow-xs mb-1">
          <span className="font-serif text-lg italic font-normal">G</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-normal tracking-tight text-[#1C1917]">
          Personal Journal
        </h1>
        <p className="text-xs sm:text-sm text-[#78716C] font-light max-w-sm mx-auto leading-relaxed">
          A calm, private sanctuary to reflect, explore your thoughts, and converse with Gemini.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-xs border border-[#EAE5DC] rounded-2xl">
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-[#FFF4F2] border border-[#FCDAD7] text-[#9A2D23] text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#C93B2B] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Sign-In Notice</p>
                <p className="mt-0.5 text-[#85231A]">{error}</p>
                <p className="text-[11px] text-[#A63C30] mt-1">
                  If popup blocking prevents Google Sign-In in this preview, select the Test Profiles tab below.
                </p>
              </div>
              <button
                onClick={clearError}
                className="text-[11px] font-semibold text-[#85231A] hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Authentication Mode Switcher */}
          <div className="flex rounded-full bg-[#F2ECE1]/80 p-1 mb-6 border border-[#E5DFD3]">
            <button
              onClick={() => setActiveTab('google')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${
                activeTab === 'google'
                  ? 'bg-white text-[#1C1917] shadow-2xs'
                  : 'text-[#686256] hover:text-[#1C1917]'
              }`}
            >
              Google Account
            </button>
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${
                activeTab === 'sandbox'
                  ? 'bg-white text-[#1C1917] shadow-2xs'
                  : 'text-[#686256] hover:text-[#1C1917]'
              }`}
            >
              Test Profiles
            </button>
          </div>

          {activeTab === 'google' ? (
            <div className="space-y-4">
              <button
                id="google-signin-btn"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-[#DBD2C1] rounded-xl bg-white text-xs sm:text-sm font-medium text-[#1C1917] hover:bg-[#FAF8F5] hover:border-[#B5AEA1] focus:outline-hidden transition shadow-2xs disabled:opacity-60 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{loading ? 'Signing in...' : 'Sign In with Google'}</span>
              </button>

              <p className="text-center text-[11px] text-[#78716C] pt-1">
                Your credentials authenticate directly with Firebase Auth.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#78716C] mb-2 font-light">
                Select a test profile to begin exploring immediately:
              </p>

              <button
                id="signin-user-alice"
                onClick={() => handleSandboxSignIn('user-alice', 'alice.researcher@example.com', 'Alice (Researcher)')}
                disabled={loading}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[#EAE5DC] hover:border-[#DBD2C1] hover:bg-[#FAF8F5] transition text-left cursor-pointer group"
              >
                <div>
                  <div className="text-xs font-semibold text-[#1C1917]">Alice (Researcher)</div>
                  <div className="text-[11px] text-[#78716C]">alice.researcher@example.com</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#A8A29E] group-hover:text-[#1C1917] transition" />
              </button>

              <button
                id="signin-user-bob"
                onClick={() => handleSandboxSignIn('user-bob', 'bob.developer@example.com', 'Bob (Engineer)')}
                disabled={loading}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[#EAE5DC] hover:border-[#DBD2C1] hover:bg-[#FAF8F5] transition text-left cursor-pointer group"
              >
                <div>
                  <div className="text-xs font-semibold text-[#1C1917]">Bob (Engineer)</div>
                  <div className="text-[11px] text-[#78716C]">bob.developer@example.com</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#A8A29E] group-hover:text-[#1C1917] transition" />
              </button>
            </div>
          )}

          {/* Privacy & Protection Highlights */}
          <div className="mt-8 pt-6 border-t border-[#F2ECE1]">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#A8A29E] mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#4E775B]" />
              Privacy Guarantees
            </h4>
            <ul className="space-y-2 text-xs text-[#57534E] font-light">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4E775B] mt-0.5 shrink-0" />
                <span>Private storage: Only accessible by your authenticated account.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4E775B] mt-0.5 shrink-0" />
                <span>Protected processing: AI reflections run securely server-side.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4E775B] mt-0.5 shrink-0" />
                <span>Data sovereignty: One-click export or permanent deletion anytime.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
