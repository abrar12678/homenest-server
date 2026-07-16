export {};

const { sendError } = require('../utils/helpers');

/**
 * Admin-only middleware — checks that req.user.role === 'admin'
 * Must be used AFTER authMiddleware
 */
function adminAuth(req: any, res: any, next: any): void {
  if (req.user?.role !== 'admin') {
    return sendError(res, 403, 'Admin access required.');
  }
  next();
}

/**
 * Agent-only middleware — checks that req.user.role === 'agent' or 'admin'
 */
function agentAuth(req: any, res: any, next: any): void {
  if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
    return sendError(res, 403, 'Agent access required.');
  }
  next();
}

module.exports = { adminAuth, agentAuth };