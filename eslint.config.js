// ESLint flat config (ESLint 9+). Correctness rules only (eslint:recommended); there is no style
// preset, since the code is already consistently formatted and style isn't what catches bugs.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'assets/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tools/**/*.mjs', 'test/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
