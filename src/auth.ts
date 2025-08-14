import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from './db/connection.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// IMPORTANT: Ensure this URL exactly matches your Vercel backend URL
// and the one in your Google Cloud Console "Authorized redirect URIs".
const redirectUri = 'https://uni-dash-backend.vercel.app/auth/google/callback';

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
    
    // Domain Restriction Check
    if (!payload.email.endsWith('@vitstudent.ac.in')) {
        const errorPageUrl = `${process.env.FRONTEND_URL}/login-error?reason=domain_mismatch`;
        return res.redirect(errorPageUrl);
    }

    // Find or create user in the database
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
      }).returning();
      user = newUser[0];
    }
    
    if (user) {
        // Create the session
        req.session.userId = user.id;
    } else {
        throw new Error("Failed to create or find user after login.");
    }

    // Redirect to the deployed frontend's dashboard
    const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;
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