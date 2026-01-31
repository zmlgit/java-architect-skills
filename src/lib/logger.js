/**
 * Unified logging utilities with colored console output.
 */

/**
 * Log an informational message (blue).
 * @param {string} msg - Message to log
 */
export function log(msg) {
  console.error(`\x1b[34m▸ ${msg}\x1b[0m`);
}

/**
 * Log a success message (green).
 * @param {string} msg - Message to log
 */
export function success(msg) {
  console.error(`\x1b[32m✓ ${msg}\x1b[0m`);
}

/**
 * Log a warning message (yellow).
 * @param {string} msg - Message to log
 */
export function warn(msg) {
  console.error(`\x1b[33m⚠ ${msg}\x1b[0m`);
}

/**
 * Log an error message (red).
 * @param {string} msg - Message to log
 */
export function error(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

/**
 * Log debug message (gray, only when DEBUG is set).
 * @param {string} msg - Message to log
 */
export function debug(msg) {
  if (process.env.DEBUG) {
    console.error(`\x1b[90m[DEBUG] ${msg}\x1b[0m`);
  }
}
