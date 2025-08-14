import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import 'dotenv/config';
import cors from 'cors';
import { pool, db } from './db/connection.js';
import { users } from './db/schema.js';
import authRouter from './auth.js';
import apiRouter from './api.js';
import { eq } from 'drizzle-orm';

const app = express();

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
    secure: true, // Should be true in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: 'none', // Required for cross-site cookies
  },
}));

app.use('/auth', authRouter);
app.use('/api', apiRouter);

// Test route for the root
app.get('/', (req, res) => {
  res.send('UniDash Backend is running! 🚀');
});

// This is the crucial part for Vercel
export default app;