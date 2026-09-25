import 'dotenv/config';
import {
  PrismaClient,
  Role,
  TargetLevel,
  CareerStatus,
  OutlookType,
  Demand,
} from '../src/generated/prisma/client';
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

  // 1. Seed Fields
  const softwareEngField = await prisma.field.upsert({
    where: { slug: 'software-engineering' },
    update: {},
    create: {
      name: 'Software Engineering',
      slug: 'software-engineering',
    },
  });

  // 2. Seed Skills
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

  // 3. Seed Career
  const backendCareer = await prisma.career.upsert({
    where: { slug: 'backend-engineer' }, // Using slug for uniqueness
    update: {
      description: 'Builds scalable server-side applications and APIs.',
      roleSummary:
        'Designs, builds, and maintains server-side applications, APIs, and services that power software products.',
      exampleActivities: [
        'Design and build REST APIs',
        'Implement business logic and backend services',
        'Design and query databases',
        'Write automated tests',
        'Monitor and troubleshoot backend systems',
      ],
      typicalEducationNote:
        'Degree in computing, related field, or equivalent bootcamp/self-study experience.',
      certificationsNote:
        'Rarely required. A strong portfolio and practical experience matter more.',
      targetLevels: [TargetLevel.RECENT_GRAD, TargetLevel.EARLY_CAREER], // Updated to new enum
      status: CareerStatus.PUBLISHED,
      fieldId: softwareEngField.id,
    },
    create: {
      slug: 'backend-engineer',
      title: 'Backend Engineer',
      description: 'Builds scalable server-side applications and APIs.',
      roleSummary:
        'Designs, builds, and maintains server-side applications, APIs, and services that power software products.',
      exampleActivities: [
        'Design and build REST APIs',
        'Implement business logic and backend services',
        'Design and query databases',
        'Write automated tests',
        'Monitor and troubleshoot backend systems',
      ],
      typicalEducationNote:
        'Degree in computing, related field, or equivalent bootcamp/self-study experience.',
      certificationsNote:
        'Rarely required. A strong portfolio and practical experience matter more.',
      targetLevels: [TargetLevel.RECENT_GRAD, TargetLevel.EARLY_CAREER],
      status: CareerStatus.PUBLISHED,
      field: { connect: { id: softwareEngField.id } },
      skills: {
        create: [
          { skill: { connect: { id: tsSkill.id } } },
          { skill: { connect: { id: nestSkill.id } } },
          { skill: { connect: { id: prismaSkill.id } } },
        ],
      },
    },
  });

  // 4. Seed Outlook Data (Idempotent: clear existing to avoid duplicates on re-seed)
  await prisma.outlookData.deleteMany({
    where: { careerId: backendCareer.id },
  });

  await prisma.outlookData.createMany({
    data: [
      {
        careerId: backendCareer.id,
        type: OutlookType.SALARY,
        geography: 'United States',
        source: 'US Bureau of Labor Statistics',
        sourceUrl: 'https://www.bls.gov/ooh/',
        period: 'May 2024',
        // OQ-10: Decimal fields passed as strings to preserve precision
        median: '95000.00',
        percentile25: '75000.00',
        percentile75: '120000.00',
        currency: 'USD',
        payPeriod: 'year',
        grossOrNet: 'gross',
        experienceLevel: 'all experience levels',
      },
      {
        careerId: backendCareer.id,
        type: OutlookType.SALARY,
        geography: 'Lagos, Nigeria',
        source: 'Local Tech Salary Survey',
        period: 'Q2 2025',
        median: '45000.00', // String for Decimal
        currency: 'NGN',
        payPeriod: 'year',
        grossOrNet: 'gross',
        experienceLevel: 'entry-level',
      },
      {
        careerId: backendCareer.id,
        type: OutlookType.EMPLOYMENT_GROWTH,
        geography: 'United States',
        source: 'US Bureau of Labor Statistics',
        period: '2023–2033',
        baseYear: 2023,
        baseValue: 208,
        projectedYear: 2033,
        projectedValue: 225,
        growthPercent: '8.00', // String for Decimal
      },
      {
        careerId: backendCareer.id,
        type: OutlookType.DEMAND,
        geography: 'Lagos, Nigeria',
        source: 'Local Tech Ecosystem Report',
        period: '2025',
        demandLevel: Demand.HIGH,
      },
    ],
  });

  // 5. Seed Pathway for the Career
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
            learningObjective:
              'Use TypeScript types, interfaces and generics to write type-safe code.',
            prerequisites: null,
            expectedActivity:
              'Complete a small exercise that models data with interfaces and a generic helper function.',
            order: 1,
            skills: { create: [{ skill: { connect: { id: tsSkill.id } } }] },
          },
          {
            title: 'Build an API with NestJS',
            description: 'Create controllers, services, and modules.',
            learningObjective:
              'Build a REST API with NestJS using controllers, services and modules.',
            prerequisites:
              'Comfortable with TypeScript basics (types, interfaces, generics).',
            expectedActivity:
              'Build a small CRUD API with at least one module, controller and service.',
            order: 2,
            skills: { create: [{ skill: { connect: { id: nestSkill.id } } }] },
          },
        ],
      },
    },
  });

  // 6. Seed a Development User
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
