const nodeGlobals = {
  require: 'readonly', module: 'writable', exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
  process: 'readonly', console: 'readonly', Buffer: 'readonly', global: 'readonly', globalThis: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly', queueMicrotask: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
  fetch: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly', structuredClone: 'readonly',
  Headers: 'readonly', Request: 'readonly', Response: 'readonly', FormData: 'readonly', Blob: 'readonly'
};
const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly',
  sessionStorage: 'readonly', location: 'readonly', history: 'readonly', fetch: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', FormData: 'readonly', Blob: 'readonly', File: 'readonly',
  FileReader: 'readonly', AbortController: 'readonly', HTMLElement: 'readonly', Event: 'readonly',
  CustomEvent: 'readonly', MutationObserver: 'readonly', IntersectionObserver: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', alert: 'readonly', confirm: 'readonly',
  prompt: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', Promise: 'readonly', crypto: 'readonly',
  caches: 'readonly', self: 'readonly', clients: 'readonly', skipWaiting: 'readonly', addEventListener: 'readonly',
  indexedDB: 'readonly', Notification: 'readonly', Headers: 'readonly', Request: 'readonly', Response: 'readonly',
  Image: 'readonly', OpsGeo: 'readonly', module: 'writable'
};
const mobileGlobals = { ...nodeGlobals, __DEV__: 'readonly', fetch: 'readonly' };
module.exports = [
  {
    ignores: ['**/node_modules/**', '**/data/**', '**/*.min.js']
  },
  {
    files: ['mobile/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: mobileGlobals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  },
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', '*.js'],
    ignores: ['backend/web/**'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: nodeGlobals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  },
  {
    files: ['backend/web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: browserGlobals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  }
];
