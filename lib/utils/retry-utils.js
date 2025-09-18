/**
 * Retry utility functions for database operations
 */

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error should trigger a retry
 * @param {Error} error - The error to check
 * @returns {boolean} True if the operation should be retried
 */
function shouldRetry(error) {
  if (!error || !error.message) return false;

  const message = error.message.toLowerCase();
  return message.includes('database is locked') ||
         message.includes('database is busy') ||
         message.includes('sqlite_busy');
}

/**
 * Execute an async operation with exponential backoff retry
 * @param {Function} operation - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 100)
 * @param {boolean} options.debug - Enable debug logging (default: false)
 * @returns {Promise} Promise that resolves with the operation result
 */
async function retryWithBackoff(operation, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const baseDelay = options.baseDelay || 100;
  const debug = options.debug || false;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      debug && console.log(`[RetryUtils] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }

  throw lastError;
}

module.exports = {
  sleep,
  shouldRetry,
  retryWithBackoff
};