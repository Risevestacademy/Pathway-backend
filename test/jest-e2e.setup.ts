import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://pathway_user:pathway_password@localhost:5432/pathway_dev?schema=public';
