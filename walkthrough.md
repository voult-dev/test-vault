 Tier 3 — Manual staging walkthrough

  0. Prerequisites (you already have these)

  - A real Voult app created in the dashboard, Client ID + Secret in hand.
  - .env written by voult init in final-test/ — confirm it has VOULT_BASE_URL, VOULT_CLIENT_ID, VOULT_CLIENT_SECRET, VOULT_SESSION_SECRET.

  1. Mount the router and start the server

  voult init already printed the snippet — put it in server.js if you haven't:
  import express from 'express';
  import { createVoultRouter } from '@voult/express';

  const app = express();
  app.use('/api/auth', createVoultRouter());
  app.listen(3000, () => console.log('listening on :3000'));
  Then:
  cd final-test
  node --env-file=.env server.js
  Expect: listening on :3000, no config error. Leave it running; do the rest from a second terminal.

  2. Register a new user

  curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"email":"solabode499@gmail.com","password":"Str0ng!Pass","fullName":"Demo User"}'
  Expect: 200/201, a Set-Cookie header in the response, and no accessToken/refreshToken in the JSON body (cookie strategy keeps those server-side).

  3. Check email verification

  Does staging actually send an email, or mock it? Either is fine — just note which:
  curl -i "http://localhost:3000/api/auth/user/verify-email?token=some-token&appId=your-app-id"
  If mocked, confirm it returns something sensible rather than a crash.

  4. Log in

  curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/email-login \
    -H 'Content-Type: application/json' \
    -d '{"email":"solabode499@gmail.com","password":"Str0ng!Pass"}'
  Expect: 200, cookies set.

  5. Fetch your profile

  curl -i -b cookies.txt http://localhost:3000/api/auth/user/me
  Expect: 200, your user object back.

  6. Refresh the session

  curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/sessions/refresh
  Expect: 200. Open cookies.txt before and after this call — the access-token cookie value should actually change.

  7. Log out, then confirm you're really logged out

  curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout
  curl -i -b cookies.txt http://localhost:3000/api/auth/user/me
  Expect: logout returns 200; the second /me call comes back 401.

  8. Bonus round — bearer strategy

  Edit .env, change session.strategy (or the relevant env var @voult/express reads for it) to bearer — you can drop VOULT_SESSION_SECRET, it's not 

Edit .env, change session.strategy (or the relevant env var @voult/express reads for it) to bearer — you can drop VOULT_SESSION_SECRET, it's not needed. Restart the server, repeat login + /me:
curl -i -X POST http://localhost:3000/api/auth/email-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOU+demo@example.com","password":"Str0ng!Pass"}'
# tokens should now be in the JSON body

curl -i http://localhost:3000/api/auth/user/me \
  -H 'Authorization: Bearer <accessToken from above>'
Expect: /me now needs the Authorization header instead of a cookie — no cookie should work anymore.

---

If anything here doesn't behave exactly as described, that's a real DX bug — file it against whichever piece actually caused it (@voult/express, @voult/cli, or the voult API), not "the demo was set up wrong." That's the whole point of this tier existing separately from the automated suites: it's the one thing that proves the real product works, not just the code in isolation.

Once you've been through all 8 steps clean, that's the last open item — Phase 1 is genuinely done at that point, and I'll update the punch-list doc and tick it off.