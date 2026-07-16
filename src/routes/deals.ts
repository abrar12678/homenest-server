export {};

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  createDeal,
  getBuyerDeals,
  getSellerDeals,
  counterOffer,
  acceptDeal,
  rejectDeal,
  completeDeal,
  withdrawDeal,
} = require('../controllers/dealController');
const {
  createDealPaymentIntent,
  confirmDealPayment,
  getDealPaymentStatus,
} = require('../controllers/dealPaymentController');

const router = express.Router();

router.use(authMiddleware);

// Deal CRUD
router.post('/', createDeal);
router.get('/buyer', getBuyerDeals);
router.get('/seller', getSellerDeals);
router.put('/:id/counter', counterOffer);
router.put('/:id/accept', acceptDeal);
router.put('/:id/reject', rejectDeal);
router.put('/:id/complete', completeDeal);
router.delete('/:id', withdrawDeal);

// Stripe Deal Payment
router.post('/:id/create-payment-intent', createDealPaymentIntent);
router.post('/:id/confirm-payment', confirmDealPayment);
router.get('/:id/payment-status', getDealPaymentStatus);

module.exports = router;