# Add Voult to a new app — from zero to "Continue with Google"

This guide takes a brand-new codebase to working sign-up, sign-in, sessions, MFA and Google/GitHub
sign-in. You write about **15 lines of server code** and a few React components. You don't write any
token handling, OAuth code, or password hashing, and you don't put any Google/GitHub keys in your `.env`.

**Time:** about 10 minutes for password auth, plus about 5 minutes per OAuth provider (most of that is in
Google's or GitHub's console).

**You need:** Node.js 20.12+ and a Voult account.

**Package versions:** `@voult/express` 0.2.1+, `@voult/sdk` 0.2.0+, `@voult/react` 0.1.0+, `@voult/cli` 0.2.0+.

---

## What you get

| Feature | How you get it |
|---|---|
| Sign up / sign in with email or username + password | Built into the router |
| Sessions in httpOnly cookies, refreshed automatically (1-hour access, 30-day refresh, rotation, reuse detection) | Built into the router |
| Sign out that actually revokes the session on Voult | Built into the router |
| Email verification, forgot/reset password | Built into the router (Voult sends the emails) |
| Sign in with **Google, GitHub**, Facebook, LinkedIn, Microsoft | Built into the router; keys live in the Voult dashboard |
| Link another provider to a signed-in account | Built into the router (`intent=link`) |
| MFA (authenticator app + backup codes), enforced for password **and** OAuth sign-in | Verify is built in; setup/enable/disable via `@voult/sdk` functions |
| Passkeys (WebAuthn), magic links, session list/revoke, linked accounts | `@voult/sdk` functions you call from your routes |
| Protect your own API routes | `requireAuth` middleware |
| React session state, sign-in actions, OAuth buttons | `@voult/react` |
| Setup checker that catches misconfiguration before users do | `npx voult doctor` |
| Rate limiting, audit log, encrypted provider secrets, signed OAuth state | Done by Voult, nothing to configure |

---

## How it works

```
 Browser (your React app)        Your server (Express)                Voult
 ────────────────────────        ─────────────────────                ─────
 @voult/react                    @voult/express
  useSession() ── /api/auth/session ──► reads httpOnly cookies
  signIn()     ── /api/auth/email-login ─► @voult/sdk ── client ID + secret ──► /api/auth/email-login
  <OAuthButton> ─ /api/auth/oauth/google/start ─► asks Voult for the Google URL ─► signs the request
        ◄──────────── 302 to Google ─────────────┘
  Google consent ──────────────────────────────────────────────────────────────► Voult exchanges the code
        ◄──── 302 /api/auth/oauth/callback?voult_code=…  (one-time, 60 s) ──────┘
                                  exchanges the code, sets cookies,
        ◄──── 302 to your page ──┘
```

- **Your server is the only thing that talks to Voult.** It holds your **Client Secret**. The browser only
  talks to your server (the `/api/auth` routes), so no secret or token is ever in JavaScript.
- **Tokens live in httpOnly cookies** that page scripts can't read, so an XSS bug can't steal them. They're
  sameSite=lax and secure in production.
- **OAuth is hosted by Voult.** Google and GitHub send users to *Voult*, Voult sends them back to your
  server with a one-time code, and your server swaps it for a session. Provider keys are stored
  (encrypted) in the Voult dashboard, never in your code.
- **Each OAuth sign-in is tied to the browser that started it**, and Voult only redirects to callback URLs
  you've allowlisted.

---

## 1. Create an app in the Voult dashboard

1. Open the dashboard at [staging.voult.dev/dashboard](https://staging.voult.dev/dashboard) (Voult is in preview; the SDK talks to this same instance by default), sign up, then **Apps** → **New App**.
2. Copy the **Client ID** and **Client Secret**. The secret is shown once; rotate it if you lose it.
3. On the app page, under **Callback URLs**, add
   `http://localhost:3000/api/auth/oauth/callback`. While the list is empty, localhost is allowed anyway;
   you'll add your production URL when you deploy.

## 2. Create the project

```bash
mkdir my-app && cd my-app
npm init -y
npm pkg set type=module
npm install express @voult/express @voult/sdk
npm install --save-dev @voult/cli
```

## 3. Write your `.env`

```bash
npx voult init
```

It asks for your Client ID, Client Secret and session strategy (keep **cookie**), then writes:
- **`.env`:** real values, including a generated `VOULT_SESSION_SECRET`. Never commit it.
- **`.env.example`:** the same keys with empty values, safe to commit.

`VOULT_BASE_URL` defaults to the hosted Voult API. Set it only if you run Voult yourself.

## 4. Mount Voult on your server

```js
// server.js
import express from 'express';
import { createVoultMiddleware, createVoultRouter, requireAuth } from '@voult/express';

const app = express();
app.set('trust proxy', 1);                      // correct https URLs behind Render/NGINX/…
app.use(createVoultMiddleware());               // req.voult on every request
app.use('/api/auth', createVoultRouter());      // all the auth routes below

// Your own API: requireAuth answers 401 JSON unless someone is signed in.
app.get('/api/me/orders', requireAuth, (req, res) => {
  res.json({ user: req.voult.getCurrentUser(), orders: [] });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

```bash
node --env-file=.env server.js
```

That's the whole backend integration.

## 5. Check the setup

```bash
npx voult doctor
```

```
  ✓ @voult/express 0.2.1, @voult/sdk 0.2.0
  ✓ .env loads and validates
  ✓ VOULT_SESSION_SECRET is set (32+ characters)
  ✓ No provider secrets in .env
  ✓ Voult API at https://… (v1.0.0)
  ✓ @voult/sdk 0.2.0 is supported
  ✓ Client ID and secret accepted (app "My App")
  ⚠ The app has no callback URLs yet, so only localhost works.
  ⚠ No sign-in providers are on, so OAuth buttons will be empty.
```

Every ✗ comes with the exact fix. Run it again whenever something doesn't work, and in CI with `--json`.

## 6. Try it from the terminal

```bash
curl -c jar -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Str0ng!Pass","fullName":"You"}'
curl -b jar -c jar localhost:3000/api/auth/session
curl -b jar -c jar localhost:3000/api/me/orders
curl -b jar -c jar -X POST localhost:3000/api/auth/logout
```

New accounts get a verification email, and sign-in returns `403 "Please verify your email"` until the
link is clicked. Passwords need 8+ characters with an uppercase letter, a lowercase letter, a number, and
one of `@$!%*?&`.

---

## 7. Add the frontend (React)

```bash
npm create vite@latest web -- --template react && cd web
npm install @voult/react
```

In development, send `/api` to your server so cookies are same-site:

```js
// web/vite.config.js
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

Then set `VOULT_APP_URL=http://localhost:5173` in the server's `.env`, so OAuth sends users back to the
frontend.

```jsx
// web/src/App.jsx
import { useState } from 'react';
import {
  VoultProvider, useSession, useVoult, OAuthButton, useOAuthProviders, getOAuthRedirectResult,
} from '@voult/react';

function SignIn() {
  const { signIn } = useVoult();
  const { providers } = useOAuthProviders();          // only providers that are ready
  const [error, setError] = useState(getOAuthRedirectResult().error?.description);

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await signIn({ email: form.get('email'), password: form.get('password') });
    } catch (err) {
      setError(err.message);                          // e.g. "Invalid email or password"
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button>Sign in</button>
      </form>
      {providers.map((p) => <OAuthButton key={p} provider={p} returnTo="/" />)}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function MfaPrompt() {
  const { verifyMfa } = useVoult();
  return (
    <form onSubmit={(e) => { e.preventDefault(); verifyMfa(new FormData(e.target).get('code')); }}>
      <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" />
      <button>Verify</button>
    </form>
  );
}

function Home() {
  const { status, user } = useSession();
  const { signOut } = useVoult();
  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'mfa_required') return <MfaPrompt />;   // after password *or* OAuth sign-in
  if (status !== 'authenticated') return <SignIn />;
  return <button onClick={signOut}>Sign out {user.email}</button>;
}

export default function App() {
  return <VoultProvider apiBase="/api/auth"><Home /></VoultProvider>;
}
```

That's a complete sign-in UI:
- password sign-in with error messages
- a button for every ready OAuth provider
- MFA
- sign-out
- sessions that survive reloads and renew quietly

**Not using React?** Call the same routes with `fetch(url, { credentials: 'include' })`. The
[voult-demo](https://github.com/voult-dev/voult-demo) home page does it in about 40 lines of plain JavaScript.

---

## 8. Turn on "Continue with Google" (no code)

1. **Google Cloud Console** → APIs & Services → Credentials → **Create OAuth client** (Web application).
2. **Voult dashboard** → your app → **Sign-in providers** → **Google**. It shows the redirect URI to copy,
   e.g. `https://api.voult.dev/api/oauth/google/callback`. Paste it into Google as an *Authorized redirect
   URI*.
3. Paste Google's **Client ID** and **Client Secret** into the Voult form, tick **Turn on**, and save.
   The secret is stored encrypted and never shown again.
4. Reload your app: a "Continue with Google" button appears.

GitHub is the same (GitHub → Settings → Developer settings → **OAuth Apps**). Facebook, LinkedIn and
Microsoft follow the same steps in their own consoles (Google and GitHub are the ones verified end to end
today). `npx voult doctor` tells you if a provider is on but missing credentials.

**What users see:**
1. They click the button.
2. Google asks them to consent.
3. They land back on your page, signed in. A new account is created on the first visit, and returning
   users are recognised by email.
4. If they have MFA on, they're asked for their code first.
5. If they cancel, your page gets `?voult_error=access_denied`.

**Linking accounts:** while signed in, `<OAuthButton provider="github" intent="link" />` adds GitHub to
the current account.

---

## 9. Use the rest of Voult from your routes

Everything else is an `@voult/sdk` function that takes `req.voult`, the per-request client that already
carries the user's session:

```js
import { setupMfa, enableMfa, listSessions, revokeSession } from '@voult/sdk';

app.post('/api/mfa/setup', requireAuth, async (req, res) => res.json(await setupMfa(req.voult)));      // QR code + secret
app.post('/api/mfa/enable', requireAuth, async (req, res) => res.json(await enableMfa(req.body.code, req.voult)));
app.get('/api/sessions', requireAuth, async (req, res) => res.json(await listSessions(req.voult)));
app.delete('/api/sessions/:id', requireAuth, async (req, res) => res.json(await revokeSession(req.params.id, req.voult)));
```

The same pattern covers passkeys (`createPasskeyRegistrationOptions`, `verifyPasskeyLogin`, …), magic
links (`signInWithEmailLink`, `verifyEmailLink`), linked accounts (`getLinkedOAuthProviders`,
`unlinkOAuthProvider`), profile updates and account deletion. The
[playground](https://github.com/voult-dev/voult-playground) wires up every one of them.

---

## 10. Deploy to production

1. Set the same variables on your host, **plus** these two:
   - `NODE_ENV=production`
   - `VOULT_APP_URL=https://myapp.com` (your frontend)

   In production the server refuses to start without a 32+ character `VOULT_SESSION_SECRET`.
2. In the Voult dashboard, add `https://myapp.com/api/auth/oauth/callback` (or wherever your server is
   reachable) under **Callback URLs**.
3. Behind a proxy, keep `app.set('trust proxy', 1)`. If the computed callback URL is still wrong, set
   `VOULT_OAUTH_CALLBACK_URL`.
4. Add `npx voult doctor --json` to CI. It exits 1 on any problem, and it catches plain-http callbacks and
   short secrets in production.

---

## Why it's easy

| You'd normally build | With Voult |
|---|---|
| Password hashing, lockout, reset tokens, verification emails | Built into the router |
| Access/refresh tokens, rotation, reuse detection, cookie handling | Built into the router |
| An OAuth client per provider, state/CSRF handling, callback endpoints | Voult-hosted; you add a button |
| MFA (TOTP, backup codes), with MFA enforced on every sign-in path | Built in |
| A login UI state machine | `useSession()` has 4 states |
| Debugging "why doesn't sign-in work?" | `npx voult doctor` |

The whole integration: **2 packages on the server, ~15 lines, 1 React provider, 0 provider secrets in
your code.**

---

## Route reference

All routes are relative to where you mount the router (`/api/auth` above). "Auth" means the route needs
a signed-in user.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/session` | – | `{ authenticated, user, mfaPending? }`; renews an expired access cookie |
| POST | `/register`, `/username-register` | – | returns `emailVerificationRequired` |
| POST | `/email-login`, `/username-login` | – | `{ mfaRequired: true }` when a code is needed |
| POST | `/mfa/verify` | – | `{ mfaToken }` (the pending sign-in is in a cookie) |
| GET | `/mfa/status` | ✓ | |
| POST | `/logout` | ✓ | revokes on Voult, clears cookies |
| POST | `/sessions/refresh` | ✓ | usually automatic |
| GET / PATCH | `/user/me` | ✓ | read / update profile |
| POST | `/user/forgot-password`, `/user/reset-password` | – | |
| GET | `/user/verify-email` | – | |
| GET | `/oauth/providers` | – | `{ providers: { google: true, … } }` |
| GET | `/oauth/:provider/start` | – (link: ✓) | `?intent=authenticate\|login\|register\|link&returnTo=/path` |
| GET | `/oauth/callback` | – | where Voult sends users back; add it to **Callback URLs** |

Where OAuth sends the browser (change with `createVoultRouter({ oauth: { successPath, mfaPath, errorPath } })`):
- `successPath` (default `/`), or `returnTo`
- `mfaPath` (default `/mfa`)
- `errorPath` (default `/login`), with `?voult_error=<CODE>&voult_error_description=…`

---

## Troubleshooting

Run `npx voult doctor` first. It covers most of these.

| Symptom | Fix |
|---|---|
| `Missing VOULT_CLIENT_ID` at startup | Run `npx voult init`; start with `node --env-file=.env server.js` |
| Sign-in works but the session is lost | Add `credentials: 'include'` to `fetch`, or proxy `/api` so frontend and server share a host |
| OAuth error `INVALID_CALLBACK_URL` | Add your server's `/api/auth/oauth/callback` under **Callback URLs** |
| OAuth error `INVALID_OAUTH_STATE` | The sign-in expired (10 min) or started in another browser/tab: try again |
| OAuth error `PROVIDER_NOT_ENABLED` / button missing | Dashboard → Sign-in providers: turn it on with credentials |
| Google says `redirect_uri_mismatch` | Paste the exact redirect URI from the Voult provider page into Google's console |
| `403 Please verify your email` | Click the link in the verification email |
| `OAUTH_REQUIRES_COOKIE_SESSION` | Hosted OAuth needs `VOULT_SESSION_STRATEGY=cookie` (the default) |

---

## Advanced

- **Bearer tokens instead of cookies** (mobile apps, APIs): `VOULT_SESSION_STRATEGY=bearer`. Tokens come
  back in the JSON and you send `Authorization: Bearer …`. Hosted OAuth needs cookies; with bearer, use
  `getOAuthAuthorizationUrl` / `exchangeOAuthCode` from `@voult/sdk` yourself.
- **Legacy token exchange** (`signInWithGoogle({ idToken })`, `/api/auth/google/authenticate`, …): still
  supported for apps that already obtain provider tokens themselves. New apps should use hosted OAuth
  above.
- **Self-hosted Voult:** set `VOULT_BASE_URL`.

**Working examples:**
- [voult-demo](https://github.com/voult-dev/voult-demo): the smallest real app, Express plus a plain-HTML page.
- [voult-playground](https://github.com/voult-dev/voult-playground): a React app exercising every feature.
