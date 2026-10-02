// ESLint flat config (ESLint 9+): eslint:recommended for correctness, plus rules that keep the code
// idiomatic JavaScript (this began as a port of Java, so the Java habits are what they guard against).
// There is no style preset; formatting is already consistent.
import js from '@eslint/js';
import globals from 'globals';
import unicorn from 'eslint-plugin-unicorn';

export default [
  { ignores: ['node_modules/', 'assets/'] },
  js.configs.recommended,
  {
    plugins: { unicorn },
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // modern syntax
      'prefer-const': 'warn',
      'no-var': 'warn',
      'prefer-template': 'warn',
      'prefer-destructuring': ['warn', { array: false, object: true }],
      'prefer-object-spread': 'warn',
      'prefer-rest-params': 'warn',
      'prefer-spread': 'warn',
      'object-shorthand': 'warn',
      'prefer-arrow-callback': 'warn',
      'no-useless-constructor': 'warn',
      'camelcase': ['warn', { properties: 'always' }],
      'eqeqeq': ['warn', 'always', { null: 'ignore' }],
      // built-ins instead of hand-written loops
      'unicorn/no-for-loop': 'warn',
      'unicorn/prefer-array-some': 'warn',
      'unicorn/prefer-array-find': 'warn',
      'unicorn/prefer-includes': 'warn',
      'unicorn/prefer-array-flat-map': 'warn',
      'unicorn/prefer-at': 'warn',
      'unicorn/prefer-set-has': 'warn',
      'unicorn/prefer-math-trunc': 'warn',
      'unicorn/prefer-number-properties': 'warn',
      'unicorn/prefer-string-slice': 'warn',
      'unicorn/prefer-optional-catch-binding': 'warn',
      'unicorn/prefer-default-parameters': 'warn',
      'unicorn/prefer-logical-operator-over-ternary': 'warn',
      'unicorn/prefer-structured-clone': 'warn',
      'unicorn/new-for-builtins': 'warn',
      'unicorn/no-lonely-if': 'warn',
      'unicorn/no-useless-undefined': 'warn',
      'unicorn/no-array-for-each': 'warn',
      'unicorn/no-static-only-class': 'warn',
    },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tools/**/*.mjs', 'test/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
