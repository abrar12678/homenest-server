export {};

const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  createPaymentIntent,
  confirmPayment,
} = require('../controllers/paymentController');

const router = Router();

// POST /api/payments/create-intent — Create Stripe payment intent (Protected)
router.post('/create-intent', authMiddleware, createPaymentIntent);

// POST /api/payments/confirm — Confirm payment & feature property (Protected)
router.post('/confirm', authMiddleware, confirmPayment);

module.exports = router;