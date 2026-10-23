// ESLint (flat config). New React code gets the strict rules; the legacy client modules that the
// UI rebuild replaces (docs/ui-migration-plan.md, phases 2 and 3) are linted with warnings only.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import globals from 'globals';

const legacyClient = ['client/*.ts', 'client/modules/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'static/',
      'public/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'graphify-out/',
      'processing/',
      'etc/',
      'assets/',
      'brand/source/',
      'data/',
      '**/.venv/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Browser code
  { files: ['client/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },

  // React components: hooks, accessibility and Tailwind classes
  {
    files: ['client/**/*.tsx'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  { files: ['client/**/*.tsx'], ...jsxA11y.flatConfigs.recommended },
  {
    files: ['client/**/*.tsx'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    rules: { ...betterTailwindcss.configs['correctness-error'].rules },
    settings: { 'better-tailwindcss': { entryPoint: 'client/styles/tailwind.css' } },
  },

  // Node code: server, scripts, tests and tool configs
  {
    files: ['**/*.{js,mjs,cjs}', 'e2e/**/*.ts', '*.config.{ts,mts}'],
    ignores: ['client/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['app.js', 'server/**/*.js', 'test/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // `const crypto = require('crypto')` is module-scoped in CommonJS, not a second global
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },

  // Legacy code: keep the signal without blocking on old patterns
  {
    files: [...legacyClient, 'app.js', 'server/**/*.js', 'test/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-regex-spaces': 'warn',
    },
  },
);
