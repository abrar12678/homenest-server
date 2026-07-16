export {};

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { sendError } = require('../utils/helpers');
const { ObjectId } = require('mongodb');

/**
 * JWT Authentication Middleware
 * Extracts token from Authorization: "Bearer <token>" header
 * Verifies the token, checks if user exists and is not banned,
 * then attaches user info to req.user
 */
async function authMiddleware(req: any, res: any, next: any): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Access denied. No token provided.');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return sendError(res, 401, 'Access denied. No token provided.');
    }

    // Reject excessively long tokens (prevent JWT bomb attacks)
    if (token.length > 2048) {
      return sendError(res, 401, 'Invalid token.');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    // Verify user still exists and is not banned
    const { getDB } = require('../config/db');
    const db = getDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { isBanned: 1, role: 1 } }
    );

    if (!user) {
      return sendError(res, 401, 'User account no longer exists.');
    }

    if (user.isBanned) {
      return sendError(res, 403, 'Your account has been suspended. Please contact support.');
    }

    // Use the latest role from DB (in case admin changed it)
    req.user.role = user.role;

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return sendError(res, 401, 'Invalid token.');
    }
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 401, 'Token expired. Please log in again.');
    }
    return sendError(res, 401, 'Authentication failed.');
  }
}

module.exports = { authMiddleware };