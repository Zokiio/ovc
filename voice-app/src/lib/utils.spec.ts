import { normalizeUrl } from './utils';

// Mock simple test runner since we don't have vitest/jest setup explicitly for unit tests in the file list
// This is a manual verification script pattern
const runTests = () => {
  const tests = [
    { input: 'example.com', expected: 'wss://example.com' },
    { input: 'ws://example.com', expected: 'ws://example.com' },
    { input: 'wss://example.com', expected: 'wss://example.com' },
    { input: '  example.com  ', expected: 'wss://example.com' },
    { input: 'localhost:8080', expected: 'wss://localhost:8080' },
  ];

  let passed = 0;
  let failed = 0;

  console.log('Running normalizeUrl tests...');

  tests.forEach(({ input, expected }) => {
    const result = normalizeUrl(input);
    if (result === expected) {
      console.log(`PASS: "${input}" -> "${result}"`);
      passed++;
    } else {
      console.error(`FAIL: "${input}" -> Expected "${expected}", got "${result}"`);
      failed++;
    }
  });

    console.log(`
  Tests completed: ${passed} passed, ${failed} failed.`);
  
    // @ts-ignore
    if (failed > 0) process.exit(1);
  };
// Check if running directly
// if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
// }

export { runTests };