export {};

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { adminAuth } = require('../middleware/roleAuth');
const {
  getAdminStats, getUsers, updateUserRole, toggleBanUser, deleteUser,
  getProperties, updatePropertyStatus, deleteProperty,
  getReviews, deleteReview,
  getMessages, deleteMessage,
  getPayments,
  getInquiries, deleteInquiry,
  getDeals, deleteDeal,
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authMiddleware, adminAuth);

// Dashboard stats
router.get('/stats', getAdminStats);

// User management
router.get('/users', getUsers);
router.put('/users/:id/role', updateUserRole);
router.put('/users/:id/ban', toggleBanUser);
router.delete('/users/:id', deleteUser);

// Property moderation
router.get('/properties', getProperties);
router.put('/properties/:id/status', updatePropertyStatus);
router.delete('/properties/:id', deleteProperty);

// Review moderation
router.get('/reviews', getReviews);
router.delete('/reviews/:id', deleteReview);

// Contact messages
router.get('/messages', getMessages);
router.delete('/messages/:id', deleteMessage);

// Payments
router.get('/payments', getPayments);

// Inquiries
router.get('/inquiries', getInquiries);
router.delete('/inquiries/:id', deleteInquiry);

// Deals
router.get('/deals', getDeals);
router.delete('/deals/:id', deleteDeal);

module.exports = router;