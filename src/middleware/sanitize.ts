export {};

const xss = require('xss');

/**
 * Sanitize string fields to prevent XSS attacks
 */
function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return xss(value.trim(), {
    allowList: {},          // strip ALL HTML
    stripIgnoreTag: true,
    stripIgnoreTagBody: true,
  });
}

/**
 * Sanitize an object in-place by mutating string values (numbers/booleans untouched)
 * Used for read-only objects like req.query / req.params in Express 5
 */
function sanitizeInPlace(obj: Record<string, any>): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizeString(obj[key]);
    } else if (Array.isArray(obj[key])) {
      for (let i = 0; i < obj[key].length; i++) {
        if (typeof obj[key][i] === 'string') {
          obj[key][i] = sanitizeString(obj[key][i]);
        } else if (typeof obj[key][i] === 'object' && obj[key][i] !== null) {
          sanitizeInPlace(obj[key][i]);
        }
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeInPlace(obj[key]);
    }
  }
}

/**
 * Sanitize an object recursively, returning a NEW object (safe for req.body)
 */
function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      clean[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeObject(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Express 5 middleware — sanitizes req.body, req.query, req.params
 * Express 5 makes req.query / req.params read-only, so we mutate in-place
 */
function sanitizeMiddleware(req: any, _res: any, next: any): void {
  // req.body is writable — replace with clean copy
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  // req.query and req.params are read-only getters in Express 5 — mutate in-place
  if (req.query && typeof req.query === 'object') {
    sanitizeInPlace(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeInPlace(req.params);
  }
  next();
}

module.exports = { sanitizeString, sanitizeObject, sanitizeMiddleware };