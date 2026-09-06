/**
 * Navigation Bar
 * Responsive header with screen navigation, active user status, and Private & Secure badge.
 */
import React from 'react';
import {
  ShieldCheck,
  BookOpen,
  LayoutDashboard,
  Clock,
  BarChart3,
  User,
  LogOut,
  Sparkles,
} from 'lucide-react';
import type { ScreenType } from '../types';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentScreen, onNavigate }) => {
  const { user, signOut } = useAuth();

  const navItems: { id: ScreenType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Journal', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'history', label: 'Archive', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'insights', label: 'Insights', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'profile', label: 'Account', icon: <User className="w-3.5 h-3.5" /> },
  ];

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }
    if (email) return email[0].toUpperCase();
    return 'J';
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#EAE5DC] bg-[#FAF8F5]/90 backdrop-blur-md transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-[#1C1917] hover:opacity-85 transition group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-[#1C1917] text-[#FAF8F5] flex items-center justify-center font-serif text-sm italic font-normal shadow-2xs group-hover:scale-105 transition">
              <span>G</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="font-serif text-base font-semibold tracking-tight text-[#1C1917]">
                Personal Journal
              </span>
            </div>
          </button>

          <div
            title="Your journal data is securely stored and private to your account"
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F3EFE6] border border-[#E5DFD3] text-[#635E54] text-[11px] font-normal tracking-wide"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#4E775B]" />
            <span>Private Sanctuary</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-[#F2ECE1]/70 p-1 rounded-full border border-[#E5DFD3]/80">
          {navItems.map((item) => {
            const isActive = currentScreen === item.id || (item.id === 'dashboard' && currentScreen === 'journal');
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#1C1917] text-[#FAF8F5] shadow-2xs'
                    : 'text-[#686256] hover:text-[#1C1917] hover:bg-[#EAE4D7]'
                }`}
              >
                {item.icon}
                <span className="hidden sm:inline tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Badge & Sign Out */}
        <div className="flex items-center gap-2.5">
          {user && (
            <button
              onClick={() => onNavigate('profile')}
              title="View account settings"
              className="hidden sm:flex items-center gap-2 text-left p-1 rounded-full hover:bg-[#F2ECE1] transition cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-[#E8E1D3] text-[#4A453B] flex items-center justify-center font-medium text-xs border border-[#DBD2C1]">
                {getInitials(user.displayName, user.email)}
              </div>
              <div className="hidden lg:flex flex-col text-xs pr-1.5">
                <span className="font-medium text-[#1C1917] truncate max-w-[120px] leading-tight">
                  {user.displayName || user.email?.split('@')[0] || 'My Space'}
                </span>
              </div>
            </button>
          )}

          <button
            id="signout-header-btn"
            onClick={signOut}
            title="Sign out of journal"
            className="p-2 rounded-full text-[#78716C] hover:text-[#1C1917] hover:bg-[#F2ECE1] transition border border-transparent hover:border-[#E5DFD3] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
