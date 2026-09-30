import { useEffect, useState } from 'react';
import {
  VoultProvider, useSession, useVoult, OAuthButton, useOAuthProviders, getOAuthRedirectResult,
  isValidPassword, PASSWORD_REQUIREMENTS_MESSAGE,
} from '@voult/react';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.message || `Request failed (${res.status})`);
  return data;
}

const formData = (e) => Object.fromEntries(new FormData(e.target));

function useSubmit() {
  const [msg, setMsg] = useState(null);
  const run = (fn) => async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn(formData(e)) });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };
  const note = msg?.text && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>;
  return [run, note];
}

function SignIn() {
  const { signIn, signUp } = useVoult();
  const { providers } = useOAuthProviders();
  const [mode, setMode] = useState('signin');
  const oauthError = getOAuthRedirectResult().error?.description;
  const [run, note] = useSubmit();

  const submit = run(async ({ email, password, fullName }) => {
    if (mode === 'forgot') {
      return (await api('/api/auth/user/forgot-password', { method: 'POST', body: { email } })).message;
    }
    if (mode === 'signup') {
      if (!isValidPassword(password)) throw new Error(PASSWORD_REQUIREMENTS_MESSAGE);
      await signUp({ email, password, fullName });
      return 'Account created. Check your email to verify it, then sign in.';
    }
    await signIn({ email, password });
  });

  return (
    <section>
      <h1>{{ signin: 'Sign in', signup: 'Create account', forgot: 'Reset password' }[mode]}</h1>
      <form onSubmit={submit} key={mode}>
        {mode === 'signup' && <input name="fullName" placeholder="Full name" autoComplete="name" required />}
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        {mode !== 'forgot' && (
          <input name="password" type="password" placeholder="Password" required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        )}
        <button>{{ signin: 'Sign in', signup: 'Sign up', forgot: 'Send reset link' }[mode]}</button>
      </form>
      {mode !== 'forgot' && providers.map((p) => (
        <OAuthButton key={p} provider={p} returnTo="/" className="oauth">Continue with {p}</OAuthButton>
      ))}
      {oauthError && <p role="alert" className="err">{oauthError}</p>}
      {note}
      <nav>
        {mode !== 'signin' && <button className="link" onClick={() => setMode('signin')}>Sign in</button>}
        {mode !== 'signup' && <button className="link" onClick={() => setMode('signup')}>Create account</button>}
        {mode !== 'forgot' && <button className="link" onClick={() => setMode('forgot')}>Forgot password?</button>}
      </nav>
    </section>
  );
}

function MfaPrompt() {
  const { verifyMfa, signOut } = useVoult();
  const [run, note] = useSubmit();
  return (
    <section>
      <h1>Two-factor authentication</h1>
      <form onSubmit={run(({ code }) => verifyMfa(code.trim()).then(() => null))}>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or backup code" required />
        <button>Verify</button>
      </form>
      {note}
      <button className="link" onClick={signOut}>Cancel</button>
    </section>
  );
}

function MfaSettings() {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [run, note] = useSubmit();
  const load = () => api('/api/auth/mfa/status').then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!status) return null;
  return (
    <section>
      <h2>Two-factor authentication: {status.mfaEnabled ? 'on' : 'off'}</h2>
      {status.mfaEnabled ? (
        <form onSubmit={run(async (body) => {
          await api('/api/mfa/disable', { method: 'POST', body });
          await load();
          return 'MFA disabled.';
        })}>
          <input name="password" type="password" placeholder="Password (if you have one)" autoComplete="current-password" />
          <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Current code" required />
          <button>Disable MFA</button>
        </form>
      ) : setup ? (
        <>
          <p>Scan with your authenticator app, or enter <code>{setup.secret}</code>.</p>
          <img src={setup.qrCode} alt="MFA QR code" width="180" height="180" />
          <p>Save these backup codes somewhere safe:</p>
          <pre>{setup.backupCodes.join('\n')}</pre>
          <form onSubmit={run(async ({ code }) => {
            await api('/api/mfa/enable', { method: 'POST', body: { code: code.trim() } });
            setSetup(null);
            await load();
            return 'MFA enabled.';
          })}>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required />
            <button>Enable</button>
          </form>
        </>
      ) : (
        <button onClick={() => api('/api/mfa/setup', { method: 'POST' }).then(setSetup)}>Set up MFA</button>
      )}
      {note}
    </section>
  );
}

function Sessions() {
  const [sessions, setSessions] = useState([]);
  const load = () => api('/api/sessions').then((d) => setSessions(d.sessions)).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <section>
      <h2>Active sessions</h2>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            {s.userAgent || s.deviceInfo || 'Unknown device'}
            {s.ipAddress && ` · ${s.ipAddress}`}
            {s.isCurrent ? ' (this device)' : (
              <button className="link" onClick={() => api(`/api/sessions/${s.id}`, { method: 'DELETE' }).then(load)}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Account() {
  const { user } = useSession();
  const { signOut } = useVoult();
  const { providers } = useOAuthProviders();
  const { linked, error } = getOAuthRedirectResult();

  return (
    <>
      <section>
        <h1>Hi, {user.fullName || user.username || user.email}</h1>
        <p>{user.email}</p>
        <button onClick={signOut}>Sign out</button>
      </section>
      {providers.length > 0 && (
        <section>
          <h2>Linked accounts</h2>
          {providers.map((p) => (
            <OAuthButton key={p} provider={p} intent="link" returnTo="/" className="oauth">Link {p}</OAuthButton>
          ))}
          {linked && <p className="ok">Linked {linked}.</p>}
          {error && <p role="alert" className="err">{error.description}</p>}
        </section>
      )}
      <MfaSettings />
      <Sessions />
    </>
  );
}

// Links from Voult's emails carry ?token=&appId=.
// ponytail: matched by path name; adjust if your Voult email templates point elsewhere.
function EmailLink() {
  const params = Object.fromEntries(new URLSearchParams(location.search));
  const [run, note] = useSubmit();
  const [verify, setVerify] = useState(null);
  const isVerify = location.pathname.includes('verify');

  useEffect(() => {
    if (!isVerify) return;
    api(`/api/auth/user/verify-email?${new URLSearchParams(params)}`)
      .then(() => setVerify({ ok: true, text: 'Email verified. You can sign in now.' }))
      .catch((err) => setVerify({ ok: false, text: err.message }));
  }, []);

  return (
    <section>
      <h1>{isVerify ? 'Verify email' : 'Choose a new password'}</h1>
      {isVerify ? <p className={verify?.ok ? 'ok' : 'err'}>{verify?.text ?? 'Verifying…'}</p> : (
        <form onSubmit={run(async ({ newPassword }) => {
          if (!isValidPassword(newPassword)) throw new Error(PASSWORD_REQUIREMENTS_MESSAGE);
          await api('/api/auth/user/reset-password', { method: 'POST', body: { ...params, newPassword } });
          return 'Password updated. You can sign in now.';
        })}>
          <input name="newPassword" type="password" placeholder="New password" autoComplete="new-password" required />
          <button>Update password</button>
        </form>
      )}
      {note}
      <a href="/">Back to sign in</a>
    </section>
  );
}

function Home() {
  const { status, error } = useSession();
  if (new URLSearchParams(location.search).has('token')) return <EmailLink />;
  if (status === 'loading') return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Can't reach the server: {error.message}</p>;
  if (status === 'mfa_required') return <MfaPrompt />;
  if (status !== 'authenticated') return <SignIn />;
  return <Account />;
}

export default function App() {
  return (
    <VoultProvider apiBase="/api/auth">
      <main><Home /></main>
    </VoultProvider>
  );
}
