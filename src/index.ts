import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import 'dotenv/config';
import cors from 'cors'; // Import cors
import { pool, db } from './db/connection.js';
import { users } from './db/schema.js';
import authRouter from './auth.js';
import { eq } from 'drizzle-orm';
import apiRouter from './api.js';
const app = express();
const PORT = process.env.PORT || 8080;

// --- Middleware ---

// CORS Middleware: Allow the frontend to make requests
app.use(cors({
  origin: 'http://localhost:5173', // The origin of your frontend app
  credentials: true, // Allow cookies to be sent
}));

const PgStore = connectPgSimple(session);
const sessionStore = new PgStore({
  pool: pool,
  tableName: 'user_sessions',
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'a-super-secret-key-that-should-be-in-env',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));


// --- API Routes ---
app.use('/auth', authRouter);
app.use('/auth', authRouter);
app.use('/api', apiRouter); 
// A protected route to check who is logged in
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, req.session.userId),
  });
  res.json({ user });
});


export default app;