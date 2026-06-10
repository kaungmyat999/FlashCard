import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AuthScreen } from './AuthScreen';

// Custom URL scheme the Electron desktop app registers. We hand the freshly
// minted Supabase session back to it through the URL fragment (which, unlike
// the query string, is never sent to any server).
const DESKTOP_SCHEME = 'flashcard://auth';

function buildHandoffUrl(accessToken: string, refreshToken: string): string {
  const fragment = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
  }).toString();
  return `${DESKTOP_SCHEME}#${fragment}`;
}

/**
 * Rendered (instead of the full app) when the page is opened with
 * `?desktop_auth=1` — i.e. the desktop app sent the user here to sign in.
 *
 * Because this runs in the user's real browser (Safari), iCloud Keychain /
 * saved-password AutoFill works normally. Once a session exists we bounce the
 * tokens back to the desktop app via the `flashcard://` scheme.
 */
export function DesktopAuthHandoff() {
  const { user, loading } = useAuth();
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const delivered = useRef(false);

  useEffect(() => {
    if (loading || !user || delivered.current) return;
    delivered.current = true;
    (async () => {
      if (!supabase) {
        setError('Supabase is not configured on the web app.');
        delivered.current = false;
        return;
      }
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        delivered.current = false;
        return;
      }
      const url = buildHandoffUrl(session.access_token, session.refresh_token);
      setHandoffUrl(url);
      // Trigger the desktop app. The browser shows an "Open FlashCard?" prompt.
      window.location.href = url;
    })();
  }, [user, loading]);

  if (loading) {
    return (
      <Centered>
        <Loader2 size={28} className="spin" />
        <p style={{ color: 'var(--text-secondary, #888)' }}>Loading…</p>
      </Centered>
    );
  }

  // Not signed in yet → show the normal login form (with AutoFill working).
  if (!user) {
    return <AuthScreen notice="Sign in to connect the FlashCard desktop app." />;
  }

  // Signed in → tokens handed off. Offer a manual re-trigger in case the
  // browser blocked the automatic scheme navigation.
  return (
    <Centered>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <GraduationCap size={28} />
        <span style={{ fontSize: '1.3rem', fontWeight: 600 }}>FlashCard AI</span>
      </div>
      <CheckCircle2 size={44} style={{ color: '#22c55e' }} />
      <h2 style={{ margin: 0 }}>You're signed in</h2>
      <p style={{ color: 'var(--text-secondary, #888)', textAlign: 'center', maxWidth: 360 }}>
        Return to the <strong>FlashCard desktop app</strong> — it should now be connected.
        You can close this tab.
      </p>
      {error && (
        <div className="alert-banner">
          <div className="alert-content">
            <AlertCircle className="alert-icon" size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}
      {handoffUrl && (
        <a href={handoffUrl} className="btn-primary" style={{ textDecoration: 'none' }}>
          Reopen the desktop app
        </a>
      )}
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-container">
      <main
        className="main-content"
        style={{
          maxWidth: 460,
          margin: '0 auto',
          paddingTop: '5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.1rem',
          textAlign: 'center',
        }}
      >
        {children}
      </main>
    </div>
  );
}
