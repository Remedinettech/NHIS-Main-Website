import { PrismaClient } from '@prisma/client';
const state = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = state.prisma ?? new PrismaClient();
if(process.env.NODE_ENV !== 'production') state.prisma = prisma;
