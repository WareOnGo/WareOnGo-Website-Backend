import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { databaseUrlWithPoolDefaults } from '../utils/databaseUrl.js';

// Shared by HTTP handlers and hosted WebP work. Extra queries wait in this
// process's bounded pool instead of opening more Supabase sessions.
const url = databaseUrlWithPoolDefaults(process.env.DATABASE_URL);
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

export default prisma;
