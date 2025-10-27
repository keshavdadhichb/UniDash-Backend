import express, { Router } from 'express';
import { db } from './db/connection.js';
import { requests, users } from './db/schema.js';
import { eq, and, not, desc } from 'drizzle-orm';
import { count } from 'drizzle-orm';

const router = Router();
router.use(express.json());

// Helper function to generate a random 4-digit OTP
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

// --- ADD THIS MISSING ROUTE ---
/**
 * GET /api/me
 * Get the currently logged-in user's basic info
 */
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.session.userId),
    });
    if (!user) {
      // User might have been deleted, destroy the session
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found, session terminated' });
    }
    // Return only necessary, non-sensitive user data
    res.json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (error) {
     console.error("Failed to fetch user:", error);
     res.status(500).json({ error: "Failed to fetch user data" });
  }
});
// --- END OF ADDED ROUTE ---


/**
 * PATCH /api/requests/:id/accept
 * Accept a delivery request...
 */
router.patch('/requests/:id/accept', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // ... (rest of the /accept route is the same as you provided)
  try {
    const requestId = parseInt(req.params.id, 10);
    const delivererId = req.session.userId;

    const request = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });

    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'This delivery is no longer available.' });
    if (request.requesterId === delivererId) return res.status(403).json({ error: 'You cannot accept your own delivery request.' });

    const otp = generateOTP();
    await db.update(requests).set({ delivererId, status: 'in_progress', otp }).where(eq(requests.id, requestId));
    res.status(200).json({ message: 'Delivery accepted successfully!', otp });
  } catch (error) {
    console.error('Failed to accept request:', error);
    res.status(500).json({ error: 'Failed to accept delivery request' });
  }
});

/**
 * POST /api/requests/:id/complete
 * Mark a delivery as complete using OTP
 */
router.post('/requests/:id/complete', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { otp } = req.body;
  const requestId = parseInt(req.params.id, 10);
  const delivererId = req.session.userId;
  if (!otp || typeof otp !== 'string' || otp.length !== 4) return res.status(400).json({ error: 'A valid 4-digit OTP is required.' });

  try {
    const request = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });
    if (!request) return res.status(404).json({ error: 'Delivery request not found.' });
    if (request.status !== 'in_progress') return res.status(400).json({ error: 'This delivery is not currently in progress.' });
    if (request.delivererId !== delivererId) return res.status(403).json({ error: 'You are not the assigned deliverer for this request.' });
    if (request.otp !== otp) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });

    await db.update(requests).set({ status: 'completed' }).where(eq(requests.id, requestId));
    res.status(200).json({ message: 'Delivery completed successfully!' });
  } catch (error) {
    console.error('Failed to complete request:', error);
    res.status(500).json({ error: 'An internal error occurred while completing the delivery.' });
  }
});

/**
 * GET /api/requests
 * Fetch all pending delivery requests...
 */
router.get('/requests', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // ... (rest of the /requests route is the same as you provided)
  try {
    const availableRequests = await db.select({
        id: requests.id, itemDescription: requests.itemDescription,
        deliveryLocationDetails: requests.deliveryLocationDetails, requesterName: users.name,
      }).from(requests).innerJoin(users, eq(requests.requesterId, users.id))
      .where(and(eq(requests.status, 'pending'), not(eq(requests.requesterId, req.session.userId))));
    res.json(availableRequests);
  } catch (error) {
    console.error('Failed to fetch requests:', error);
    res.status(500).json({ error: 'Failed to fetch delivery requests' });
  }
});

/**
 * POST /api/requests
 * Create a new delivery request
 */
router.post('/requests', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // ... (rest of the POST /requests route is the same as you provided)
  const { itemDescription, pickupLocation, requesterPhone, deliveryLocationType, deliveryLocationDetails, specialInstructions } = req.body;
  if (!itemDescription || !pickupLocation || !requesterPhone || !deliveryLocationType || !deliveryLocationDetails) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    if (requesterPhone) { await db.update(users).set({ phone: requesterPhone }).where(eq(users.id, req.session.userId)); }
    const newRequest = await db.insert(requests).values({
      requesterId: req.session.userId, itemDescription, pickupLocation, requesterPhone,
      deliveryLocationType, deliveryLocationDetails, specialInstructions, status: 'pending',
    }).returning();
    res.status(201).json(newRequest[0]);
  } catch (error) {
    console.error("Failed to create request:", error);
    res.status(500).json({ error: "Failed to create delivery request" });
  }
});


/**
 * GET /api/my-requests
 * Get requests created by the logged-in user...
 */
router.get('/my-requests', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // ... (rest of the /my-requests route is the same as you provided)
  try {
    const myRequests = await db.select({
        id: requests.id, itemDescription: requests.itemDescription, status: requests.status, otp: requests.otp,
        deliveryLocationDetails: requests.deliveryLocationDetails, createdAt: requests.createdAt, delivererName: users.name,
      }).from(requests).leftJoin(users, eq(requests.delivererId, users.id))
      .where(eq(requests.requesterId, req.session.userId)).orderBy(desc(requests.createdAt));
    res.json(myRequests);
  } catch (error) {
    console.error("Failed to fetch user's requests:", error);
    res.status(500).json({ error: "Failed to fetch your requests" });
  }
});

/**
 * GET /api/my-deliveries
 * Get deliveries accepted by the logged-in user...
 */
router.get('/my-deliveries', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // ... (rest of the /my-deliveries route is the same as you provided)
  try {
    const myDeliveries = await db.select({
        id: requests.id, itemDescription: requests.itemDescription, deliveryLocationDetails: requests.deliveryLocationDetails,
        requesterName: users.name, requesterPhone: users.phone,
      }).from(requests).innerJoin(users, eq(requests.requesterId, users.id))
      .where(and(eq(requests.delivererId, req.session.userId), eq(requests.status, 'in_progress')))
      .orderBy(desc(requests.createdAt));
    res.json(myDeliveries);
  } catch (error) {
    console.error('Failed to fetch deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch your deliveries' });
  }
});

/**
 * GET /me/stats
 * Get statistics for the logged-in user
 */
router.get('/me/stats', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // ... (rest of the /me/stats route is the same as you provided)
  const userId = req.session.userId;
  try {
    const [requestsCreated] = await db.select({ value: count() }).from(requests).where(eq(requests.requesterId, userId));
    const [deliveriesCompleted] = await db.select({ value: count() }).from(requests).where(and(eq(requests.delivererId, userId), eq(requests.status, 'completed')));
    res.json({ requestsCreated: requestsCreated.value, deliveriesCompleted: deliveriesCompleted.value });
  } catch (error) {
    console.error('Failed to fetch user stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
