import { useEffect, useState } from 'react';
import {
  VoultProvider, useSession, useVoult, OAuthButton, useOAuthProviders, getOAuthRedirectResult,
  isValidPassword, PASSWORD_REQUIREMENTS_MESSAGE,
} from '@voult/react';

// Read the OAuth redirect result once, then drop ?voult_* from the URL so a reload doesn't show it again.
const oauthResult = getOAuthRedirectResult();
if (/[?&]voult_/.test(location.search)) history.replaceState(null, '', '/');

const OAUTH_ERRORS = {
  access_denied: 'Sign-in was cancelled, so you are not signed in.',
  INVALID_OAUTH_STATE: 'That sign-in expired or was started in another tab. Please try again.',
  LOGIN_REQUIRED: 'Sign in before linking another account.',
  PROVIDER_ALREADY_LINKED_TO_ANOTHER_USER: 'That account is already linked to a different user.',
  OAUTH_CALLBACK_FAILED: "Voult couldn't finish the sign-in after the provider approved it. This is a problem on Voult's side, not with your account. The server terminal has details.",
};
const oauthErrorMessage = (error) =>
  error && (OAUTH_ERRORS[error.code] || error.description || 'Sign-in failed. Please try again.');

const PROVIDER_NAMES = { github: 'GitHub', linkedin: 'LinkedIn' };
const providerName = (p) => PROVIDER_NAMES[p] || p[0].toUpperCase() + p.slice(1);

const ICONS = {
  google: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.1 4.8 18 5.1 18 5.1c.6 1.6.2 2.8.1 3.1.7.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  ),
};

// "Chrome on macOS" from a user agent; good enough to tell your own devices apart.
function describeDevice(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : /curl/i.test(ua) ? 'curl' : 'Unknown browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}

const timeAgo = (date) => {
  const mins = Math.round((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(date).toLocaleDateString();
};

function Notice({ msg }) {
  if (!msg?.text) return null;
  return <p role={msg.ok ? 'status' : 'alert'} className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>;
}

// Wraps a submit or click handler: busy state, and a success/error notice from what it returns or throws.
function useAction() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = (fn) => async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn(e?.target instanceof HTMLFormElement ? Object.fromEntries(new FormData(e.target)) : undefined);
      setMsg(text ? { ok: true, text } : null);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, msg, setMsg };
}

function ProviderButton({ provider, intent, children }) {
  return (
    <OAuthButton provider={provider} intent={intent} returnTo="/" className="btn btn-provider">
      {ICONS[provider]}<span>{children}</span>
    </OAuthButton>
  );
}

function SignIn() {
  const { signIn, signUp } = useVoult();
  const { providers } = useOAuthProviders();
  const [mode, setMode] = useState('signin');
  const { run, busy, msg } = useAction();
  const oauthError = oauthErrorMessage(oauthResult.error);

  const submit = run(async ({ email, password, fullName }) => {
    if (mode === 'forgot') {
      const res = await fetch('/api/auth/user/forgot-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Could not send the reset link.');
      return data.message;
    }
    if (mode === 'signup') {
      if (!isValidPassword(password)) throw new Error(PASSWORD_REQUIREMENTS_MESSAGE);
      await signUp({ email, password, fullName });
      setMode('signin');
      return 'Account created. Check your email for the verification link, then sign in.';
    }
    await signIn({ email, password });
  });

  const title = { signin: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password' }[mode];
  const subtitle = {
    signin: 'Sign in to continue.',
    signup: 'It takes less than a minute.',
    forgot: "Enter your email and we'll send you a reset link.",
  }[mode];

  return (
    <div className="card auth">
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>

      {mode !== 'forgot' && providers.length > 0 && (
        <>
          <div className="stack">
            {providers.map((p) => (
              <ProviderButton key={p} provider={p}>Continue with {providerName(p)}</ProviderButton>
            ))}
          </div>
          <div className="divider"><span>or</span></div>
        </>
      )}

      <form className="stack" onSubmit={submit} key={mode}>
        {mode === 'signup' && (
          <label>Full name<input name="fullName" autoComplete="name" required /></label>
        )}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        {mode !== 'forgot' && (
          <label>
            <span className="row between">
              Password
              {mode === 'signin' && (
                <button type="button" className="link" onClick={() => setMode('forgot')}>Forgot password?</button>
              )}
            </span>
            <input name="password" type="password" required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            {mode === 'signup' && <small className="muted">{PASSWORD_REQUIREMENTS_MESSAGE}</small>}
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode]}
        </button>
      </form>

      <Notice msg={msg ?? (oauthError && { ok: false, text: oauthError })} />

      <p className="muted center">
        {mode === 'signin' ? "Don't have an account? " : mode === 'signup' ? 'Already have an account? ' : ''}
        <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Create one' : mode === 'signup' ? 'Sign in' : 'Back to sign in'}
        </button>
      </p>
    </div>
  );
}

function MfaPrompt() {
  const { verifyMfa, mfa } = useVoult();
  const { run, busy, msg } = useAction();
  return (
    <div className="card auth">
      <h1>Two-factor authentication</h1>
      <p className="muted">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
      <form className="stack" onSubmit={run(({ code }) => verifyMfa(code.trim()).then(() => null))}>
        <input name="code" className="code" inputMode="numeric" autoComplete="one-time-code"
          placeholder="123456" aria-label="Authentication code" autoFocus required />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
      </form>
      <Notice msg={msg} />
      <p className="center">
        <button className="link" onClick={run(() => mfa.cancel().then(() => null))}>Cancel and go back</button>
      </p>
    </div>
  );
}

function MfaCard() {
  const { mfa } = useVoult();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const { run, busy, msg } = useAction();
  const load = () => mfa.status().then(setStatus);
  useEffect(() => { load().catch(() => {}); }, []);

  return (
    <section className="card">
      <header className="row between">
        <div>
          <h2>Two-factor authentication</h2>
          <p className="muted">Ask for a code from your authenticator app at every sign-in.</p>
        </div>
        {status && <span className={`badge ${status.mfaEnabled ? 'on' : ''}`}>{status.mfaEnabled ? 'On' : 'Off'}</span>}
      </header>

      {!status ? <p className="muted">Loading…</p> : status.mfaEnabled ? (
        <form className="stack" onSubmit={run(async (body) => {
          await mfa.disable({ code: body.code.trim(), password: body.password || undefined });
          await load();
          return 'Two-factor authentication is off.';
        })}>
          <p className="muted">{status.backupCodesRemaining} backup codes left. To turn it off, confirm with a current code.</p>
          <div className="row">
            <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required />
            <input name="password" type="password" autoComplete="current-password" placeholder="Password (if set)" />
          </div>
          <button className="btn btn-danger" disabled={busy}>Turn off</button>
        </form>
      ) : setup ? (
        <div className="stack">
          <ol className="steps">
            <li>
              Scan this QR code with Google Authenticator, 1Password, Authy or similar.
              <img className="qr" src={setup.qrCode} alt="QR code for your authenticator app" />
              <small className="muted">Can't scan? Enter this key: <code>{setup.secret}</code></small>
            </li>
            <li>
              Save these backup codes. Each one signs you in once if you lose your phone.
              <pre className="codes">{setup.backupCodes.join('\n')}</pre>
            </li>
            <li>
              Enter the code your app shows to finish.
              <form className="row" onSubmit={run(async ({ code }) => {
                await mfa.enable(code.trim());
                setSetup(null);
                await load();
                return 'Two-factor authentication is on. You will be asked for a code next time you sign in.';
              })}>
                <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required />
                <button className="btn btn-primary" disabled={busy}>Turn on</button>
              </form>
            </li>
          </ol>
          <button className="link" onClick={() => setSetup(null)}>Cancel setup</button>
        </div>
      ) : (
        <button className="btn" disabled={busy} onClick={run(async () => { setSetup(await mfa.setup()); })}>
          Set up two-factor authentication
        </button>
      )}
      <Notice msg={msg} />
    </section>
  );
}

function SessionsCard() {
  const { sessions } = useVoult();
  const [list, setList] = useState(null);
  const { run, msg } = useAction();
  const load = () => sessions.list().then((d) => setList(d.sessions));
  useEffect(() => { load().catch(() => setList([])); }, []);

  return (
    <section className="card">
      <header className="row between">
        <div>
          <h2>Active sessions</h2>
          <p className="muted">Devices signed in to your account. Revoke any you don't recognise.</p>
        </div>
        <button className="btn btn-small" onClick={run(load)}>Refresh</button>
      </header>
      {!list ? <p className="muted">Loading…</p> : (
        <ul className="list">
          {list.map((s) => (
            <li key={s.id} className="row between">
              <div>
                <strong>{describeDevice(s.userAgent)}</strong>
                {s.isCurrent && <span className="badge on">This device</span>}
                <div className="muted small">
                  {s.ipAddress && `${s.ipAddress} · `}Active {timeAgo(s.lastUsedAt || s.createdAt)}
                </div>
              </div>
              {!s.isCurrent && (
                <button className="btn btn-small btn-danger" onClick={run(async () => {
                  await sessions.revoke(s.id);
                  await load();
                  return `Signed out ${describeDevice(s.userAgent)}.`;
                })}>Revoke</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Notice msg={msg} />
    </section>
  );
}

function LinkedAccountsCard() {
  const { linkedAccounts } = useVoult();
  const { providers } = useOAuthProviders();
  const [linked, setLinked] = useState(null);
  const { run, msg, setMsg } = useAction();
  // Voult returns provider names or { provider, … } objects depending on version.
  const load = () => linkedAccounts.list()
    .then((d) => setLinked(d.providers.map((p) => (typeof p === 'string' ? p : p.provider))));

  useEffect(() => {
    load().catch(() => setLinked([]));
    if (oauthResult.linked) setMsg({ ok: true, text: `${providerName(oauthResult.linked)} is now linked.` });
    else if (oauthResult.error) setMsg({ ok: false, text: oauthErrorMessage(oauthResult.error) });
  }, []);

  const all = [...new Set([...(linked ?? []), ...providers])];
  return (
    <section className="card">
      <header>
        <h2>Linked accounts</h2>
        <p className="muted">Sign in with any linked account.</p>
      </header>
      {!linked ? <p className="muted">Loading…</p> : all.length === 0 ? (
        <p className="muted">No sign-in providers are turned on for this app yet.</p>
      ) : (
        <ul className="list">
          {all.map((p) => (
            <li key={p} className="row between">
              <span className="row provider">{ICONS[p]}<strong>{providerName(p)}</strong>
                {linked.includes(p) && <span className="badge on">Linked</span>}
              </span>
              {linked.includes(p) ? (
                <button className="btn btn-small" onClick={run(async () => {
                  await linkedAccounts.unlink(p);
                  await load();
                  return `${providerName(p)} was unlinked.`;
                })}>Unlink</button>
              ) : (
                <OAuthButton provider={p} intent="link" returnTo="/" className="btn btn-small">Link</OAuthButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <Notice msg={msg} />
    </section>
  );
}

function Account() {
  const { user } = useSession();
  const { signOut } = useVoult();
  const name = user.fullName || user.username || user.email;

  return (
    <div className="stack wide">
      <section className="card row between">
        <div className="row">
          <div className="avatar" aria-hidden="true">{name[0].toUpperCase()}</div>
          <div>
            <h1>{name}</h1>
            {user.email !== name && <p className="muted">{user.email}</p>}
          </div>
        </div>
        <button className="btn" onClick={() => signOut().catch(() => {})}>Sign out</button>
      </section>
      <MfaCard />
      <LinkedAccountsCard />
      <SessionsCard />
    </div>
  );
}

// Links from Voult's emails carry ?token=&appId=.
// ponytail: matched by path name; adjust if your Voult email templates point elsewhere.
function EmailLink() {
  const params = Object.fromEntries(new URLSearchParams(location.search));
  const isVerify = location.pathname.includes('verify');
  const { run, busy, msg, setMsg } = useAction();

  const call = async (path, init) => {
    const res = await fetch(path, { credentials: 'include', ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || 'This link is invalid or has expired.');
  };

  useEffect(() => {
    if (!isVerify) return;
    call(`/api/auth/user/verify-email?${new URLSearchParams(params)}`)
      .then(() => setMsg({ ok: true, text: 'Your email is verified. You can sign in now.' }))
      .catch((err) => setMsg({ ok: false, text: err.message }));
  }, []);

  return (
    <div className="card auth">
      <h1>{isVerify ? 'Verifying your email' : 'Choose a new password'}</h1>
      {isVerify ? !msg && <p className="muted">One moment…</p> : (
        <form className="stack" onSubmit={run(async ({ newPassword }) => {
          if (!isValidPassword(newPassword)) throw new Error(PASSWORD_REQUIREMENTS_MESSAGE);
          await call('/api/auth/user/reset-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...params, newPassword }),
          });
          return 'Your password was updated. You can sign in now.';
        })}>
          <label>New password<input name="newPassword" type="password" autoComplete="new-password" required /></label>
          <small className="muted">{PASSWORD_REQUIREMENTS_MESSAGE}</small>
          <button className="btn btn-primary" disabled={busy}>Update password</button>
        </form>
      )}
      <Notice msg={msg} />
      <p className="center"><a href="/">Back to sign in</a></p>
    </div>
  );
}

function Home() {
  const { status, error } = useSession();
  if (new URLSearchParams(location.search).has('token')) return <EmailLink />;
  if (status === 'loading') return <p className="muted center">Loading…</p>;
  if (error) return <div className="card auth"><Notice msg={{ ok: false, text: `Can't reach the server: ${error.message}` }} /></div>;
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
