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

app.use(express.json());

// DEBUG LOGGING MIDDLEWARE
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log(`   Headers:`, JSON.stringify(req.headers['cookie'] ? { ...req.headers, cookie: '[HIDDEN]' } : req.headers));
  console.log(`   Cookie Present: ${!!req.headers.cookie}`);

  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    console.log(`   Body:`, JSON.stringify(req.body));
  }

  // Capture response status
  const originalSend = res.send;
  res.on('finish', () => {
    console.log(`   Status: ${res.statusCode} ${res.statusMessage || ''}`);
    if (res.statusCode >= 400) {
      console.log(`   ⚠️ Request Failed: ${res.statusCode}`);
    }
  });

  next();
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false, // Allow extraction by Flutter WebView
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: 'lax' // lax is better for redirect flows
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
