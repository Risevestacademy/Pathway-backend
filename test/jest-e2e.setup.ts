process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://pathway:pathway@localhost:5432/pathway_test?schema=public';
