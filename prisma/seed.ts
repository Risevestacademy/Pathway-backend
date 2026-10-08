import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedCatalog } from './seed-catalog';
import { readAdminConfig, seedAdmin, seedDevUser } from './seed-users';

// 1. Initialize the adapter exactly like your PrismaService does
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// 2. Pass the adapter to the PrismaClient
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');
  const adminConfig = readAdminConfig();

  await seedAdmin(prisma, adminConfig);
  await seedDevUser(prisma);
  await seedCatalog(prisma);

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
