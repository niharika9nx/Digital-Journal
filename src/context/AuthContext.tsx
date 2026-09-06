/**
 * Authentication Context
 * Manages Firebase User session, ID token acquisition, and session expiration events.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthUser } from '../types';
import {
  signInWithGooglePopup,
  signInWithDevAccount,
  signOutUser,
  subscribeToAuthState,
} from '../lib/firebase';
import { registerSessionExpiredHandler } from '../lib/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  sessionExpired: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithSandbox: (uid: string, email: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  dismissSessionExpired: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  // Register session expired listener from API client
  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setSessionExpired(true);
      setUser(null);
    });
  }, []);

  // Subscribe to Firebase Auth changes
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Authentication error occurred');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authUser = await signInWithGooglePopup();
      setUser(authUser);
      setSessionExpired(false);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithSandbox = useCallback(async (uid: string, email: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const authUser = await signInWithDevAccount(uid, email, name);
      setUser(authUser);
      setSessionExpired(false);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with sandbox account');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await signOutUser();
      setUser(null);
    } catch (err: any) {
      setError(err.message || 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        sessionExpired,
        signInWithGoogle,
        signInWithSandbox,
        signOut,
        dismissSessionExpired,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
