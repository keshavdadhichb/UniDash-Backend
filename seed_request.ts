import { db } from './src/db/connection.js';
import { requests, users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function seed() {
    // 1. Ensure a secondary user exists
    let [otherUser] = await db.select().from(users).where(eq(users.email, 'dummy@vitstudent.ac.in'));

    if (!otherUser) {
        [otherUser] = await db.insert(users).values({
            googleId: 'dummy_123',
            email: 'dummy@vitstudent.ac.in',
            name: 'Test Student',
            phone: '9999999999',
            registrationNumber: '21BCE9999'
        }).returning();
        console.log('Created dummy user');
    }

    // 2. Create a pending request from this user
    await db.insert(requests).values({
        requesterId: otherUser.id,
        itemDescription: 'Test Order for Runner View',
        itemType: 'Food',
        paymentStatus: 'Paid',
        pickupLocation: 'SJT',
        deliveryLocation: 'Q Block',
        note: 'This is a test request to verify the feed.',
        status: 'pending'
    });

    console.log('Seeded dummy request');
    process.exit(0);
}

seed().catch(console.error);
