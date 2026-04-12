/** @file Validation helpers. Return { valid, errors[] } for composability. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a value is present (not null, undefined, or empty string).
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function required(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return { valid: false, errors: [`${fieldName} is required`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a value is a valid UUID v4.
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function isUuid(value, fieldName) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    return { valid: false, errors: [`${fieldName} must be a valid UUID`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a value is one of the allowed options.
 * @param {*} value
 * @param {Array} options
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function isIn(value, options, fieldName) {
  if (!options.includes(value)) {
    return { valid: false, errors: [`${fieldName} must be one of: ${options.join(', ')}`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a value is a positive number (> 0).
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function isPositiveNumber(value, fieldName) {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
    return { valid: false, errors: [`${fieldName} must be a positive number`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a value is a non-negative number (>= 0).
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function isNonNegativeNumber(value, fieldName) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) {
    return { valid: false, errors: [`${fieldName} must be a non-negative number`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a value is a valid date string.
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function isDate(value, fieldName) {
  if (typeof value !== 'string' || isNaN(new Date(value).getTime())) {
    return { valid: false, errors: [`${fieldName} must be a valid date`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a string does not exceed maxLength.
 * @param {*} value
 * @param {number} maxLength
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function maxLength(value, maxLength, fieldName) {
  if (typeof value === 'string' && value.length > maxLength) {
    return { valid: false, errors: [`${fieldName} must be at most ${maxLength} characters`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate that a number is within a range (inclusive).
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {string} fieldName
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function isInRange(value, min, max, fieldName) {
  if (typeof value !== 'number' || !isFinite(value) || value < min || value > max) {
    return { valid: false, errors: [`${fieldName} must be between ${min} and ${max}`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Combine multiple validation results into one.
 * @param  {...{ valid: boolean, errors: string[] }} results
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function combine(...results) {
  const errors = results.flatMap(r => r.errors);
  return { valid: errors.length === 0, errors };
}
