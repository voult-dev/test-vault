import express from 'express';
import { createVoultMiddleware, createVoultRouter, requireAuth } from '@voult/express';
import { setupMfa, enableMfa, disableMfa, listSessions, revokeSession } from '@voult/sdk';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(createVoultMiddleware());
app.use('/api/auth', createVoultRouter());

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.voult.getCurrentUser() }));

app.post('/api/mfa/setup', requireAuth, async (req, res) => res.json(await setupMfa(req.voult)));
app.post('/api/mfa/enable', requireAuth, async (req, res) => res.json(await enableMfa(req.body.code, req.voult)));
app.post('/api/mfa/disable', requireAuth, async (req, res) =>
  res.json(await disableMfa(req.body.password, req.body.code, req.voult)));
app.get('/api/sessions', requireAuth, async (req, res) => res.json(await listSessions(req.voult)));
app.delete('/api/sessions/:id', requireAuth, async (req, res) =>
  res.json(await revokeSession(req.params.id, req.voult)));

// SDK errors carry the Voult status; send them back as JSON instead of Express's HTML 500.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: { code: err.apiCode || err.code, message: err.message, status } });
});

app.listen(3000, () => console.log('http://localhost:3000'));
