import express from 'express';
import { createVoultRouter } from '@voult/express';

const app = express();
app.use('/api/auth', createVoultRouter());
app.listen(3000, () => console.log('listening on :3000'));