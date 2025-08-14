import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import 'dotenv/config';
import * as schema from './schema.js';

// Create a connection pool to the database
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

// Create a Drizzle instance
export const db = drizzle(pool, { schema });