import { useState } from 'react';
import { GraduationCap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function ResetPasswordScreen() {
  const { updatePassword, clearRecoveryMode } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
      // Give the user a moment to read the success message, then enter the app.
      setTimeout(clearRecoveryMode, 1800);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update password.');
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

        <div className="glass-form-card">
          {done ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle2 size={40} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
              <h2 className="form-title">Password updated</h2>
              <p className="form-desc">Your password has been changed. Taking you to the app…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 className="form-title">Set new password</h2>
              <p className="form-desc">Choose a new password for your account.</p>

              <div className="form-group">
                <label htmlFor="new-password" className="form-label">New password</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password" className="form-label">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="form-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              {error && (
                <div className="alert-banner" style={{ marginBottom: '1rem' }}>
                  <div className="alert-content">
                    <AlertCircle className="alert-icon" size={18} />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-primary btn-submit"
                  disabled={busy}
                  style={{ width: '100%' }}
                >
                  {busy ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
