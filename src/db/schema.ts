import { pgTable, serial, text, varchar, timestamp, integer, boolean, json } from 'drizzle-orm/pg-core';

// SESSION TABLE: for connect-pg-simple
export const userSessions = pgTable('user_sessions', {
  sid: varchar('sid').primaryKey(),
  sess: json('sess').notNull(),
  expire: timestamp('expire').notNull(),
});

// USER TABLE: Stores student information
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  googleId: varchar('google_id').notNull().unique(),
  email: varchar('email').notNull().unique(),
  name: varchar('name').notNull(),
  avatarUrl: varchar('avatar_url'),
  phone: varchar('phone'),                // Captured in Onboarding
  registrationNumber: varchar('registration_number'), // Parsed from email
  createdAt: timestamp('created_at').defaultNow(),
});

export const requests = pgTable('requests', {
  id: serial('id').primaryKey(),
  requesterId: integer('requester_id').references(() => users.id).notNull(),
  delivererId: integer('deliverer_id').references(() => users.id),

  // -- New Fields --
  itemDescription: text('item_description').notNull(),
  itemType: varchar('item_type').notNull(),         // 'Food', 'Paperwork', 'Others'
  paymentStatus: varchar('payment_status').notNull(), // 'Paid', 'Not Paid'

  pickupLocation: varchar('pickup_location').notNull(),
  deliveryLocation: text('delivery_location').notNull(), // Specific text input

  note: text('note'),                               // Additional instructions

  // -- Delivery Logistics --
  otp: varchar('otp'),                              // 4-digit code
  status: varchar('status').default('pending'),     // pending, in_progress, completed, cancelled

  createdAt: timestamp('created_at').defaultNow(),
});
