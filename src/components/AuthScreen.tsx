import { useState } from 'react';
import { GraduationCap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (mode !== 'forgot' && !password) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email.trim(), password);
        if (needsEmailConfirmation) {
          setInfo('Account created. Check your email to confirm before signing in.');
        }
      } else {
        await resetPassword(email.trim());
        setInfo('Password reset email sent. Check your inbox and follow the link.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-container">
      <main className="main-content" style={{ maxWidth: 460, margin: '0 auto', paddingTop: '4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem' }}>
          <GraduationCap size={32} />
          <span style={{ fontSize: '1.4rem', fontWeight: 600 }}>FlashCard AI</span>
        </div>

        <form onSubmit={handleSubmit} className="glass-form-card">
          <h2 className="form-title">
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
          </h2>
          <p className="form-desc">
            {mode === 'signin'
              ? 'Sign in to access your blocks and vocabulary cards.'
              : mode === 'signup'
              ? 'Create an account to sync blocks and cards across devices.'
              : "Enter your email and we'll send you a reset link."}
          </p>

          <div className="form-group">
            <label htmlFor="auth-email" className="form-label">Email</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== 'forgot' && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                <label htmlFor="auth-password" className="form-label" style={{ marginBottom: 0 }}>Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '0.8rem',
                      color: 'var(--primary)',
                      textDecoration: 'none',
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="alert-banner" style={{ marginBottom: '1rem' }}>
              <div className="alert-content">
                <AlertCircle className="alert-icon" size={18} />
                <span>{error}</span>
              </div>
            </div>
          )}
          {info && (
            <div className="alert-banner" style={{ marginBottom: '1rem' }}>
              <div className="alert-content">
                <CheckCircle2 className="alert-icon" size={18} />
                <span>{info}</span>
              </div>
            </div>
          )}

          <div className="form-actions">
            {mode === 'forgot' ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => switchMode('signin')}
                  disabled={busy}
                >
                  Back to sign in
                </button>
                <button type="submit" className="btn-primary btn-submit" disabled={busy}>
                  {busy ? 'Sending...' : 'Send reset link'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                  disabled={busy}
                >
                  {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
                </button>
                <button type="submit" className="btn-primary btn-submit" disabled={busy}>
                  {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
              </>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
