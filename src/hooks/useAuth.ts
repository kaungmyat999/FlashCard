import { useEffect, useRef, useState } from 'react';
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface UseAuthResult {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authEvent: AuthChangeEvent | null;
  isRecoveryMode: boolean;
  clearRecoveryMode: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

interface RecoveryParams {
  accessToken: string;
  refreshToken: string;
}

function extractRecoveryParams(): RecoveryParams | null {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('type') !== 'recovery') return null;
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

function cleanUrlHash() {
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  // Capture recovery params before the effect (and before Supabase/any code can strip them).
  const recoveryParamsRef = useRef<RecoveryParams | null>(extractRecoveryParams());

  const clearRecoveryMode = () => setIsRecoveryMode(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setAuthEvent(event);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    const params = recoveryParamsRef.current;
    if (params) {
      // Remove the access_token from the URL immediately before doing anything with it.
      cleanUrlHash();
      // Establish session from the JWT in the recovery link.
      supabase.auth
        .setSession({ access_token: params.accessToken, refresh_token: params.refreshToken })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (!error && data.session) {
            setSession(data.session);
            setIsRecoveryMode(true);
          }
          setLoading(false);
        });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      });
    }

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/',
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  return {
    user: session?.user ?? null,
    session,
    loading,
    authEvent,
    isRecoveryMode,
    clearRecoveryMode,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
  };
}
