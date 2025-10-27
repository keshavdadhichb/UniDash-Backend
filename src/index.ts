import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import 'dotenv/config';
import cors from 'cors';
import { pool } from './db/connection.js';
import authRouter from './auth.js';
import apiRouter from './api.js';

const app = express();

// CRITICAL FIX: Trust proxy for Vercel
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

const PgStore = connectPgSimple(session);
const sessionStore = new PgStore({
  pool: pool,
  tableName: 'user_sessions',
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: 'none'
  },
}));

// Debug middleware (remove after fixing)
app.use((req, res, next) => {
  console.log('📍 Request:', req.method, req.path);
  console.log('🍪 Cookies:', req.headers.cookie);
  console.log('👤 Session userId:', req.session?.userId);
  next();
});

app.use('/auth', authRouter);
app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('UniDash Backend is running! 🚀');
});

// For Vercel serverless
export default app;

// For local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}
