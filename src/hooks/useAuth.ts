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
  // Separate user state so we can refresh metadata from the server independently
  // of the session JWT (which may be stale on devices that haven't re-authenticated).
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
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
      setUser(newSession?.user ?? null);
      setAuthEvent(event);
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true);
    });

    const params = recoveryParamsRef.current;
    if (params) {
      cleanUrlHash();
      supabase.auth
        .setSession({ access_token: params.accessToken, refresh_token: params.refreshToken })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (!error && data.session) {
            setSession(data.session);
            setUser(data.session.user);
            setIsRecoveryMode(true);
          }
          setLoading(false);
        });
    } else {
      supabase.auth.getSession().then(async ({ data: sessionData }) => {
        if (cancelled) return;
        setSession(sessionData.session);
        // Seed user from the cached JWT immediately so the app renders without waiting.
        setUser(sessionData.session?.user ?? null);
        setLoading(false);

        // Then fetch the live user record from the server in the background.
        // The JWT caches metadata at issue time, so another device's updateUser
        // won't be visible until we ask the server directly.
        if (sessionData.session) {
          const { data: liveData } = await supabase.auth.getUser();
          if (!cancelled && liveData.user) setUser(liveData.user);
        }
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
    user,
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
