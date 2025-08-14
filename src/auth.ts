import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from './db/connection.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Initialize the Google OAuth client with our credentials
const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:8080/auth/google/callback' // The same redirect URI from Google Console
);

// 1. The route that starts the login process
// It generates a URL to Google's login page and redirects the user there.
router.get('/google', (req, res) => {
  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
  });
  res.redirect(authorizeUrl);
});
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out, please try again.' });
    }
    // Clears the session cookie from the browser
    res.clearCookie('connect.sid'); 
    res.status(200).json({ message: 'Logged out successfully' });
  });
});
// 2. The route Google redirects back to after a successful login
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query; // Google provides a 'code'
    if (!code) {
      return res.status(400).send('Missing code parameter');
    }

    // Exchange the code for tokens (access token, ID token)
    const { tokens } = await oAuth2Client.getToken(code as string);
    oAuth2Client.setCredentials(tokens);

    // Get user profile information from the ID token
    const ticket = await oAuth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID!,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub || !payload.name) {
      return res.status(400).send('Invalid user payload from Google');
    }
    
    // --- UniDash Specific Logic ---
    // SECURITY CHECK: Ensure the user has a @vitstudent.ac.in email
    if (!payload.email.endsWith('@vitstudent.ac.in')) {
        return res.status(403).send('Login failed. Only @vitstudent.ac.in emails are permitted.');
    }

    // Check if user already exists in our database
    let user = await db.query.users.findFirst({
        where: eq(users.googleId, payload.sub),
    });

    if (user) {
      // If user exists, update their name and avatar if it changed
      await db.update(users).set({
        name: payload.name,
        avatarUrl: payload.picture,
      }).where(eq(users.id, user.id));
    } else {
      // If user does not exist, create a new user record
      const newUser = await db.insert(users).values({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture,
      }).returning();
      user = newUser[0];
    }
    
    if (user) {
        // --- CREATE THE SESSION ---
        // This is the key part: we store the user's ID in the session.
        // The session middleware will automatically handle sending the cookie.
        req.session.userId = user.id;

        console.log(`User ${user.email} logged in successfully and session created!`);
    } else {
        throw new Error("Failed to create or find user after login.");
    }

    // Finally, redirect to the frontend dashboard
    // The frontend will run on port 5173 by default with Vite
    res.redirect('http://localhost:5173/dashboard');

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).send('Authentication failed.');
  }
});

export default router;