/** @file Structured logger with offline buffer. See V2_INFRASTRUCTURE.md §3.2 */

const LOG_BUFFER_KEY = '_log_buffer';
const MAX_BUFFER_SIZE = 200;

/**
 * Read the offline log buffer from localStorage.
 * @returns {Array} Buffered log entries
 */
function readBuffer() {
  try {
    const raw = localStorage.getItem(LOG_BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Append a log entry to the offline buffer.
 * @param {object} entry
 */
function bufferEntry(entry) {
  try {
    const buffer = readBuffer();
    buffer.push(entry);
    // Keep buffer bounded
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
    }
    localStorage.setItem(LOG_BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    // If localStorage is full or unavailable, drop silently
  }
}

/**
 * Create a structured log entry.
 * @param {'info'|'warn'|'error'} level
 * @param {string} category - Source module/area (maps to `source` column)
 * @param {string} message
 * @param {object} [context]
 * @returns {object}
 */
function createEntry(level, category, message, context) {
  return {
    level,
    source: category,
    message: typeof message === 'string' ? message.slice(0, 2000) : String(message),
    context: context || null,
    created_at: new Date().toISOString(),
  };
}

export const logger = {
  /**
   * Log an info-level message.
   * @param {string} category
   * @param {string} message
   * @param {object} [context]
   */
  info(category, message, context) {
    const entry = createEntry('info', category, message, context);
    console.info(`[${category}]`, message, context || '');
    bufferEntry(entry);
  },

  /**
   * Log a warning.
   * @param {string} category
   * @param {string} message
   * @param {object} [context]
   */
  warn(category, message, context) {
    const entry = createEntry('warn', category, message, context);
    console.warn(`[${category}]`, message, context || '');
    bufferEntry(entry);
  },

  /**
   * Log an error.
   * @param {string} category
   * @param {string} message
   * @param {object} [context]
   */
  error(category, message, context) {
    const entry = createEntry('error', category, message, context);
    console.error(`[${category}]`, message, context || '');
    bufferEntry(entry);
  },

  /**
   * Get all buffered log entries (for flushing to Supabase).
   * @returns {Array}
   */
  getBuffer() {
    return readBuffer();
  },

  /**
   * Clear the offline buffer after successful flush.
   */
  clearBuffer() {
    try {
      localStorage.removeItem(LOG_BUFFER_KEY);
    } catch {
      // Ignore
    }
  },
};
