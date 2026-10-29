import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'server/storage/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['e2e/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['client/vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  prettier,
];
