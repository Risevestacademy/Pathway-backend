import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 1. Ignore generated files and dependencies
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js'],
  },
  // 2. Apply recommended JS and TS rules
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // 3. Customize rules for our project
  {
    rules: {
      // Warn instead of error for unused vars (common in NestJS placeholders)
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  }
);