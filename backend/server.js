import express from 'express';
import { createVoultMiddleware, createVoultRouter, requireAuth } from '@voult/express';

const app = express();
app.set('trust proxy', 1);
app.use(createVoultMiddleware());
app.use('/api/auth', createVoultRouter()); // every auth route: sign-in, MFA, sessions, linked accounts, passkeys, magic links

// Your own API: requireAuth answers 401 JSON unless someone is signed in.
app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.voult.getCurrentUser() }));

app.listen(4000, () => console.log('http://localhost:4000'));
