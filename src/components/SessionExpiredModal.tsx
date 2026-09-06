/**
 * Session Expired Modal
 * Displays a dialog when the session expires or requires re-authentication.
 */
import React from 'react';
import { LogIn, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SessionExpiredModal: React.FC = () => {
  const { sessionExpired, dismissSessionExpired } = useAuth();

  if (!sessionExpired) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/50 backdrop-blur-xs p-4">
      <div className="bg-[#FAF8F5] rounded-3xl border border-[#EAE5DC] shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5 text-center">
        <div className="w-12 h-12 rounded-full bg-[#F4F0E8] border border-[#E8E1D3] flex items-center justify-center text-[#A87B32] mx-auto">
          <Lock className="w-5 h-5" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-serif font-normal text-[#1C1917]">
            Session Expired
          </h3>
          <p className="text-xs text-[#78716C] font-light leading-relaxed">
            Your authentication session has concluded. Please sign in again to continue your private reflections securely.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={dismissSessionExpired}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#1C1917] text-[#FAF8F5] text-xs font-medium hover:bg-[#2B2724] transition shadow-2xs cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-[#D6CEBF]" />
            <span>Sign In Again</span>
          </button>
        </div>
      </div>
    </div>
  );
};
