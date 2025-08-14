import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql', // Corrected: 'driver' is now 'dialect'
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Using 'url' is the modern standard
  },
} satisfies Config;