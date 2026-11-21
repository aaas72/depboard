import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/build-meta/**', '**/*.d.ts', '**/*.d.mts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['packages/cli/src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Repo maintenance scripts: plain Node ESM, outside any tsconfig.
    files: ['scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    rules: { ...tseslint.configs.disableTypeChecked.rules, 'no-console': 'off' },
  },
  prettier,
);
