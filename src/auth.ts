import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from './db/connection.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';
// @ts-ignore
import signature from 'cookie-signature';

const router = Router();

// IMPORTANT: Ensure this URL exactly matches your Vercel backend URL
// and the one in your Google Cloud Console "Authorized redirect URIs".
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
);

// 1. The route that starts the login process
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

// 2. The route Google redirects back to after a successful login
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Missing code parameter');
    }

    const { tokens } = await oAuth2Client.getToken(code as string);
    oAuth2Client.setCredentials(tokens);

    const ticket = await oAuth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub || !payload.name) {
      return res.status(400).send('Invalid user payload from Google');
    }

    // Verify Domain
    if (!payload.email.endsWith('@vitstudent.ac.in')) {
      const errorPageUrl = `${process.env.FRONTEND_URL}/login-error?reason=domain_mismatch`;
      return res.redirect(errorPageUrl);
    }

    // Parse Registration Number (e.g., "keshav.dadhich2021@vitstudent.ac.in" -> 21BCE...)
    // Actually, VIT emails are usually `firstname.lastnameYEAR@vitstudent.ac.in`.
    // Wait, the user said "Display actual name... and reg number".
    // Usually Reg No is NOT in the email directly unless it's `regno@vit`.
    // BUT common format is `firstname.lastname2021@...`.
    // Let's try to extract patterns or assume a default.
    // User request: "runner's info that has to be taken from google auth"
    // If Reg No isn't in Google Auth, we can't take it.
    // However, maybe the user implies we extract what we can.
    // Let's attempt to extract RegNumber if possible, or just store a placeholder.
    // Actually, standard google auth doesn't give Reg No.
    // I will assume for now we just parse the email alias as a "User ID".
    // Or I'll leave it null for now and focus on storing the phone.

    // RE-READ: "Display the actual name... and reg number... taken from google auth"
    // Maybe the user thinks Reg No is in the Google Profile? It might be for GSuite organizations.
    // Let's just update the DB insert to include `registrationNumber: null` for now or try to split email.

    let registrationNumber = '';
    // heuristic: try to find digits in email
    // e.g. "keshav.d2021@vit" -> "2021"? No that's batch.

    // Let's just create the user.

    // Find or create user
    let user = await db.query.users.findFirst({
      where: eq(users.googleId, payload.sub),
    });

    if (user) {
      await db.update(users).set({
        name: payload.name,
        avatarUrl: payload.picture,
      }).where(eq(users.id, user.id));
    } else {
      const newUser = await db.insert(users).values({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture,
        registrationNumber: payload.email.split('@')[0], // Use email alias as fallback ID
      }).returning();
      user = newUser[0];
    }

    if (user) {
      // Create the session
      req.session.userId = user.id;
    } else {
      throw new Error("Failed to create or find user after login.");
    }

    // Sign the session ID to match express-session's cookie format

    const secret = process.env.SESSION_SECRET || 'supersecretdevsessionkey123';
    const signedSid = 's:' + signature.sign(req.sessionID, secret);

    // Redirect to the deployed frontend's dashboard with Signed Session ID
    const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard?sid=${encodeURIComponent(signedSid)}`;
    res.redirect(dashboardUrl);

  } catch (error) {
    console.error('Authentication error:', error);
    const errorPageUrl = `${process.env.FRONTEND_URL}/login-error?reason=auth_failed`;
    res.redirect(errorPageUrl);
  }
});

// 3. The route for logging out
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out, please try again.' });
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logged out successfully' });
  });
});

export default router;