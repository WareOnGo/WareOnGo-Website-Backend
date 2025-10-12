import { PrismaClient } from '@prisma/client';

// Single Prisma client instance for the app
const prisma = new PrismaClient();

export default prisma;
