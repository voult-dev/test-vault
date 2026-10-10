import express from 'express';
import { createVoultMiddleware, createVoultRouter, requireAuth } from '@voult/express';

const app = express();
app.set('trust proxy', 1);

// What each OAuth error code means, for the terminal log below.
const OAUTH_ERROR_HELP = {
  OAUTH_CALLBACK_FAILED:
    "Voult's API threw an unexpected error after the provider approved you (usually while reading your " +
    'provider profile). Nothing in this app caused it. Once Voult commit 72c7ffd is deployed, this shows up as ' +
    'PROVIDER_PROFILE_FAILED with the real reason.',
  PROVIDER_PROFILE_FAILED: "The provider issued a token but Voult couldn't read the profile. Check the OAuth app's scopes/permissions.",
  PROVIDER_TOKEN_EXCHANGE_FAILED: 'The provider rejected the code. Check the client ID/secret in the Voult dashboard and the callback URL registered at the provider.',
  PROVIDER_ALREADY_LINKED_TO_ANOTHER_USER: 'That provider account already belongs to another user in this app. Sign in with it, or unlink it there first.',
  INVALID_CALLBACK_URL: "This server's /api/auth/oauth/callback URL isn't on the app's Callback URLs allowlist.",
  INVALID_OAUTH_STATE: 'The sign-in expired (10 min) or was started in another browser/tab.',
  LOGIN_REQUIRED: 'Linking needs a signed-in session.',
  access_denied: 'The user cancelled on the provider consent screen. Not a bug.',
};

// Log every failed request and every OAuth redirect that carries an error.
app.use((req, res, next) => {
  const chunks = [];
  const end = res.end;
  res.end = function (chunk, ...rest) {
    if (chunk) chunks.push(Buffer.from(chunk));
    return end.call(this, chunk, ...rest);
  };
  res.on('finish', () => {
    const where = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const location = res.getHeader('location');
    const params = location && new URL(location, 'http://x').searchParams;
    if (params?.get('voult_error')) {
      const code = params.get('voult_error');
      console.error(`[oauth] ${where} → ${code}: ${params.get('voult_error_description') ?? ''}`);
      if (OAUTH_ERROR_HELP[code]) console.error(`        ${OAUTH_ERROR_HELP[code]}`);
    } else if (res.statusCode >= 400) {
      console.error(`[error] ${where} → ${res.statusCode} ${Buffer.concat(chunks).toString().slice(0, 500)}`);
    }
  });
  next();
});
app.use(createVoultMiddleware());
app.use('/api/auth', createVoultRouter()); // every auth route: sign-in, MFA, sessions, linked accounts, passkeys, magic links

// Your own API: requireAuth answers 401 JSON unless someone is signed in.
app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.voult.getCurrentUser() }));

app.listen(4000, () => console.log('http://localhost:4000'));
