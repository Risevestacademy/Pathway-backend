import { PrismaClient, Role } from '../src/generated/prisma/client';
import * as bcrypt from 'bcrypt';

const DEV_USER = { email: 'dev@example.com', password: 'password123' };

export interface AdminConfig {
  email: string;
  password: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function readAdminConfig(): AdminConfig {
  return {
    email: requireEnv('ADMIN_EMAIL').toLowerCase(),
    password: requireEnv('ADMIN_PASSWORD'),
  };
}

async function ensureProfile(
  prisma: PrismaClient,
  userId: string,
  fullName: string,
) {
  await prisma.userProfile.upsert({
    where: { userId },
    update: {}, // never clobber a name the user has since edited
    create: { userId, fullName },
  });
}

export async function seedAdmin(
  prisma: PrismaClient,
  { email, password }: AdminConfig,
) {
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN }, // promote if the user already exists; no passwordHash here
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  // Existing user case: verify only if not already verified (keeps the original timestamp on re-runs)
  await prisma.user.updateMany({
    where: { id: admin.id, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });

  await ensureProfile(prisma, admin.id, 'Pathway Rise Admin');

  if (!admin.passwordHash) {
    console.warn(
      `Admin ${email} has no password (existing social-login account). Seed does not set one.`,
    );
  }
}

export async function seedDevUser(prisma: PrismaClient) {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping dev user in production');
    return;
  }

  const dev = await prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: {},
    create: {
      email: DEV_USER.email,
      passwordHash: await bcrypt.hash(DEV_USER.password, 10),
      role: Role.USER,
      emailVerifiedAt: new Date(),
    },
  });

  // Fill nulls only, and only for seeded accounts, never every user in the table
  await prisma.user.updateMany({
    where: { email: DEV_USER.email, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });

  await ensureProfile(prisma, dev.id, 'Dev User');
}
