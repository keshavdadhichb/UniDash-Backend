import { pgTable, serial, text, varchar, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

// USER TABLE: Stores student information
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  googleId: text('google_id').unique().notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  email: varchar('email', { length: 256 }).unique().notNull(),
  avatarUrl: text('avatar_url'),
  phone: varchar('phone', { length: 15 }), // <-- merged from first snippet
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// REQUESTS TABLE: Stores all delivery requests
export const requests = pgTable('requests', {
  id: serial('id').primaryKey(),
  requesterId: integer('requester_id').references(() => users.id).notNull(),
  delivererId: integer('deliverer_id').references(() => users.id),
  status: varchar('status', { length: 50 }).default('pending').notNull(),

  // NEW SIMPLIFIED FIELDS
  itemDescription: text('item_description').notNull(),
  pickupLocation: text('pickup_location').notNull(), // <-- NEW universal field
  deliveryLocationType: varchar('delivery_location_type').notNull(), // 'hostel' or 'campus'
  deliveryLocationDetails: text('delivery_location_details').notNull(),
  requesterPhone: varchar('requester_phone', { length: 15 }).notNull(),
  specialInstructions: text('special_instructions'),

  // Removed: estimatedPrice, isFoodItem, foodPaymentStatus, foodCollectionLocation

  otp: varchar('otp', { length: 4 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
