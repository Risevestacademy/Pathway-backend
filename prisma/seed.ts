import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

// 1. Initialize the adapter exactly like your PrismaService does
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// 2. Pass the adapter to the PrismaClient
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');

  // 1. Seed Skills
  const tsSkill = await prisma.skill.upsert({
    where: { name: 'TypeScript' },
    update: {},
    create: { name: 'TypeScript', description: 'Strongly typed JavaScript' },
  });

  const nestSkill = await prisma.skill.upsert({
    where: { name: 'NestJS' },
    update: {},
    create: { name: 'NestJS', description: 'Progressive Node.js framework' },
  });

  const prismaSkill = await prisma.skill.upsert({
    where: { name: 'Prisma' },
    update: {},
    create: { name: 'Prisma', description: 'Next-generation ORM' },
  });

  // 2. Seed Career
  const backendCareer = await prisma.career.upsert({
    where: { id: 'career-backend-engineer' },
    update: {},
    create: {
      id: 'career-backend-engineer',
      title: 'Backend Engineer',
      description: 'Builds scalable server-side applications and APIs.',
      category: 'Software Engineering',
      skills: {
        create: [
          { skillId: tsSkill.id },
          { skillId: nestSkill.id },
          { skillId: prismaSkill.id },
        ],
      },
    },
  });

  // 3. Seed Pathway for the Career
  await prisma.pathway.upsert({
    where: { careerId: backendCareer.id },
    update: {},
    create: {
      careerId: backendCareer.id,
      title: 'Backend Engineering Fundamentals',
      description: 'Core steps to become a proficient backend engineer.',
      steps: {
        create: [
          {
            title: 'Learn TypeScript Basics',
            description: 'Understand types, interfaces, and generics.',
            order: 1,
            skills: { create: [{ skillId: tsSkill.id }] },
          },
          {
            title: 'Build an API with NestJS',
            description: 'Create controllers, services, and modules.',
            order: 2,
            skills: { create: [{ skillId: nestSkill.id }] },
          },
        ],
      },
    },
  });

  // 4. Seed a Development User
  const hashedPassword = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'dev@example.com' },
    update: {},
    create: {
      email: 'dev@example.com',
      passwordHash: hashedPassword,
      role: Role.USER,
    },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
