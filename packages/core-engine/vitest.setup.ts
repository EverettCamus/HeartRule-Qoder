/**
 * Vitest setup file for core-engine package
 *
 * This file is loaded before running tests in the core-engine package.
 */

// Set LOG_LEVEL to debug for tests so all logs are visible
process.env.LOG_LEVEL = 'debug';

console.log('✅ core-engine test environment setup completed');
