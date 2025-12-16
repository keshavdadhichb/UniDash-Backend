import express, { Router } from 'express';
import { db } from './db/connection.js';
import { requests, users } from './db/schema.js';
import { eq, and, not, desc, or } from 'drizzle-orm';
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
      req.session.destroy(() => { });
      return res.status(401).json({ error: 'User not found, session terminated' });
    }
    // Return only necessary, non-sensitive user data
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        registrationNumber: user.registrationNumber
      }
    });
  } catch (error) {
    console.error("Failed to fetch user:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

/**
 * PUT /api/me
 * Update user profile (specifically phone)
 */
router.put('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    await db.update(users).set({ phone }).where(eq(users.id, req.session.userId));
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// --- END OF ADDED ROUTE ---

/**
 * GET /api/active-order
 * Check if the user has any ongoing order (as requester or runner)
 */
router.get('/active-order', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.userId;

  try {
    // 1. Check if user is a RUNNER for an active order
    const runnerOrder = await db.select({
      id: requests.id, itemDescription: requests.itemDescription,
      pickupLocation: requests.pickupLocation, deliveryLocation: requests.deliveryLocation,
      note: requests.note, status: requests.status, paymentStatus: requests.paymentStatus,
      requesterName: users.name, requesterPhone: users.phone, requesterRegNo: users.registrationNumber
    }).from(requests).innerJoin(users, eq(requests.requesterId, users.id))
      .where(and(eq(requests.delivererId, userId), eq(requests.status, 'in_progress')))
      .limit(1);

    if (runnerOrder.length > 0) {
      return res.json({ role: 'runner', order: runnerOrder[0] });
    }

    // 2. Check if user is a REQUESTER for an active order
    // We consider 'pending' as active for the dashboard view? 
    // The user said "if I have made a order... screen converted to status"
    // Let's include 'pending' as well, so they see "Searching for runner..."
    const requesterOrder = await db.select({
      id: requests.id, itemDescription: requests.itemDescription,
      pickupLocation: requests.pickupLocation, deliveryLocation: requests.deliveryLocation,
      status: requests.status, otp: requests.otp, paymentStatus: requests.paymentStatus,
      delivererName: users.name, delivererPhone: users.phone
    }).from(requests).leftJoin(users, eq(requests.delivererId, users.id))
      .where(and(eq(requests.requesterId, userId),
        or(eq(requests.status, 'pending'), eq(requests.status, 'in_progress'))))
      .orderBy(desc(requests.createdAt))
      .limit(1);

    if (requesterOrder.length > 0) {
      return res.json({ role: 'requester', order: requesterOrder[0] });
    }

    return res.json(null); // No active order
  } catch (error) {
    console.error("Failed to check active order:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


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
    console.log(`[DEBUG] Generated OTP for Request #${requestId}: ${otp}`);
    await db.update(requests).set({ delivererId, status: 'in_progress', otp }).where(eq(requests.id, requestId));
    res.status(200).json({ message: 'Delivery accepted successfully!' });
  } catch (error) {
    console.error('Failed to accept request:', error);
    res.status(500).json({ error: 'Failed to accept delivery request' });
  }
});

/**
 * POST /api/requests/:id/cancel
 * Cancel a pending delivery request
 */
router.post('/requests/:id/cancel', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const requestId = parseInt(req.params.id, 10);
  const requesterId = req.session.userId;

  try {
    const request = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });

    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.requesterId !== requesterId) return res.status(403).json({ error: 'You are not valid requester to cancel this order.' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Cannot cancel an order that is already in progress or completed.' });

    await db.update(requests).set({ status: 'cancelled' }).where(eq(requests.id, requestId));
    res.status(200).json({ message: 'Request cancelled successfully.' });
  } catch (error) {
    console.error("Failed to cancel request:", error);
    res.status(500).json({ error: "Failed to cancel request" });
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
    if (request.otp !== otp) {
      console.log(`[DEBUG] OTP Mismatch for Request #${requestId}. Expected: '${request.otp}', Received: '${otp}'`);
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

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
      id: requests.id,
      itemDescription: requests.itemDescription,
      itemType: requests.itemType,
      paymentStatus: requests.paymentStatus,
      pickupLocation: requests.pickupLocation,
      deliveryLocation: requests.deliveryLocation,
      note: requests.note,
      requesterName: users.name,
      requesterRegNo: users.registrationNumber, // Display RegNo
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

  const { itemDescription, itemType, paymentStatus, pickupLocation, deliveryLocation, note } = req.body;

  // Validation
  if (!itemDescription || !itemType || !paymentStatus || !pickupLocation || !deliveryLocation) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newRequest = await db.insert(requests).values({
      requesterId: req.session.userId,
      itemDescription,
      itemType,
      paymentStatus,
      pickupLocation,
      deliveryLocation,
      note: note || '',
      status: 'pending',
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
      pickupLocation: requests.pickupLocation, deliveryLocation: requests.deliveryLocation,
      createdAt: requests.createdAt, delivererName: users.name, delivererPhone: users.phone
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
      id: requests.id, itemDescription: requests.itemDescription,
      pickupLocation: requests.pickupLocation, deliveryLocation: requests.deliveryLocation,
      note: requests.note,
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
