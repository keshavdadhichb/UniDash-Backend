import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number; // We will store the user's ID here
  }
}