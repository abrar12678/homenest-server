export {};

const stripe = require('stripe');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { isValidObjectId, sendError, sendSuccess } = require('../utils/helpers');

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
  : null;

// Earnest money percentage (e.g., 2% of final amount as advance)
const EARNEST_MONEY_PERCENTAGE = 2;
// Minimum earnest money in BDT
const MIN_EARNEST_MONEY_BDT = 5000;
// Maximum earnest money in BDT
const MAX_EARNEST_MONEY_BDT = 500000;
// BDT to USD conversion rate (approximate)
const BDT_TO_USD = 0.0083;

/**
 * POST /api/deals/:id/create-payment-intent
 * Buyer creates a Stripe PaymentIntent for earnest money on an accepted deal.
 * Body (optional): { customAmount } — allows buyer to pay custom amount >= minimum
 */
async function createDealPaymentIntent(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { customAmount } = req.body || {};

    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    if (!stripeClient) {
      return sendError(res, 500, 'Payment service is not configured. Please set STRIPE_SECRET_KEY.');
    }

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    // Only buyer can create payment
    if (deal.buyerId.toString() !== req.user.userId) {
      return sendError(res, 403, 'Only the buyer can make this payment.');
    }

    // Deal must be accepted
    if (deal.status !== 'accepted') {
      return sendError(res, 400, 'Payment can only be made for accepted deals.');
    }

    // Prevent duplicate payment intents on the same deal
    if (deal.stripePaymentId) {
      // Check if there's already a successful payment
      const existingIntent = await stripeClient.paymentIntents.retrieve(deal.stripePaymentId);
      if (existingIntent.status === 'succeeded') {
        return sendError(res, 400, 'Payment for this deal has already been completed.');
      }
      // If previous intent exists but didn't succeed, allow creating a new one
    }

    // Calculate earnest money amount
    const finalAmount = deal.finalAmount || deal.offerAmount;
    let earnestMoneyBDT = Math.round(finalAmount * (EARNEST_MONEY_PERCENTAGE / 100));

    // Allow custom amount if provided and within bounds
    if (customAmount && typeof customAmount === 'number' && customAmount > 0) {
      if (customAmount < MIN_EARNEST_MONEY_BDT) {
        return sendError(res, 400, `Minimum earnest money is ৳${MIN_EARNEST_MONEY_BDT.toLocaleString()}.`);
      }
      if (customAmount > MAX_EARNEST_MONEY_BDT) {
        return sendError(res, 400, `Maximum earnest money is ৳${MAX_EARNEST_MONEY_BDT.toLocaleString()}.`);
      }
      earnestMoneyBDT = Math.round(customAmount);
    }

    // Apply minimum
    earnestMoneyBDT = Math.max(earnestMoneyBDT, MIN_EARNEST_MONEY_BDT);

    // Convert to USD cents for Stripe
    const amountInUsdCents = Math.round(earnestMoneyBDT * BDT_TO_USD * 100);

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.max(amountInUsdCents, 50), // Stripe minimum $0.50
      currency: 'usd',
      metadata: {
        dealId: id,
        propertyId: deal.propertyId.toString(),
        buyerId: req.user.userId,
        agentId: deal.agentId.toString(),
        finalAmountBDT: String(finalAmount),
        earnestMoneyBDT: String(earnestMoneyBDT),
        paymentType: 'earnest_money',
      },
      description: `Earnest Money for: ${deal.propertyTitle} (Deal #${id.slice(-8)})`,
      automatic_payment_methods: { enabled: true },
    });

    // Store payment intent ID on the deal (don't change status yet)
    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          stripePaymentId: paymentIntent.id,
          earnestMoneyBDT,
          earnestMoneyUSD: (amountInUsdCents / 100).toFixed(2),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    sendSuccess(res, {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      earnestMoneyBDT,
      earnestMoneyUSD: (amountInUsdCents / 100).toFixed(2),
      finalAmount,
      percentage: EARNEST_MONEY_PERCENTAGE,
    });
  } catch (error: any) {
    console.error('Create deal payment intent error:', error.message);
    sendError(res, 500, 'Failed to create payment. Please try again.');
  }
}

/**
 * POST /api/deals/:id/confirm-payment
 * Buyer confirms the Stripe payment has been completed.
 * Body: { paymentIntentId }
 *
 * This verifies the payment on Stripe, updates the deal status to payment_pending,
 * and records the payment in the payments collection.
 */
async function confirmDealPayment(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { paymentIntentId } = req.body;

    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    if (!stripeClient) {
      return sendError(res, 500, 'Payment service is not configured.');
    }

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    // Only buyer can confirm payment
    if (deal.buyerId.toString() !== req.user.userId) {
      return sendError(res, 403, 'Only the buyer can confirm this payment.');
    }

    // Verify payment intent on Stripe
    let paymentIntent;
    try {
      paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return sendError(res, 400, 'Invalid payment intent.');
    }

    if (paymentIntent.status !== 'succeeded') {
      return sendError(res, 400, 'Payment has not been completed yet. Please complete the payment first.');
    }

    // Verify this payment intent belongs to this deal
    if (paymentIntent.metadata.dealId !== id) {
      return sendError(res, 400, 'Payment intent does not match this deal.');
    }

    const now = new Date().toISOString();
    const earnestMoneyBDT = deal.earnestMoneyBDT || Number(paymentIntent.metadata.earnestMoneyBDT) || 0;

    // Update deal status
    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'payment_pending',
          paymentMethod: 'stripe',
          paymentNote: `Stripe payment of ৳${earnestMoneyBDT.toLocaleString()} (${paymentIntentId})`,
          stripePaymentId: paymentIntentId,
          stripePaymentStatus: 'succeeded',
          updatedAt: now,
        },
        $push: {
          history: {
            action: 'payment_submitted',
            amount: earnestMoneyBDT,
            message: `Earnest money of ৳${earnestMoneyBDT.toLocaleString()} paid via Stripe. Transaction: ${paymentIntentId.slice(-12)}`,
            byUserId: new ObjectId(req.user.userId),
            byUserName: deal.buyerName,
            byRole: req.user.role,
            createdAt: now,
          },
        },
      }
    );

    // Record in payments collection
    await db.collection('payments').insertOne({
      userId: new ObjectId(req.user.userId),
      propertyId: deal.propertyId,
      dealId: new ObjectId(id),
      stripePaymentId: paymentIntentId,
      amount: earnestMoneyBDT,
      currency: 'BDT',
      paymentType: 'earnest_money',
      status: 'completed',
      createdAt: now,
    });

    const updated = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    sendSuccess(res, {
      deal: {
        ...updated,
        _id: updated._id.toString(),
        propertyId: updated.propertyId?.toString?.() || String(updated.propertyId),
        buyerId: updated.buyerId?.toString?.() || String(updated.buyerId),
        agentId: updated.agentId?.toString?.() || String(updated.agentId),
        history: (updated.history || []).map((h: any) => ({
          ...h,
          byUserId: h.byUserId?.toString?.() || String(h.byUserId),
        })),
      },
    });
  } catch (error: any) {
    console.error('Confirm deal payment error:', error.message);
    sendError(res, 500, 'Failed to confirm payment.');
  }
}

/**
 * GET /api/deals/:id/payment-status
 * Check the current Stripe payment status for a deal
 */
async function getDealPaymentStatus(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    // Must be a participant
    const userId = req.user.userId;
    if (deal.buyerId.toString() !== userId && deal.agentId.toString() !== userId) {
      return sendError(res, 403, 'You are not a participant in this deal.');
    }

    const result: any = {
      hasPayment: !!deal.stripePaymentId,
      paymentMethod: deal.paymentMethod || '',
      earnestMoneyBDT: deal.earnestMoneyBDT || 0,
      earnestMoneyUSD: deal.earnestMoneyUSD || '0.00',
      stripePaymentStatus: deal.stripePaymentStatus || null,
    };

    // If stripe client available and there's a payment intent, check live status
    if (stripeClient && deal.stripePaymentId) {
      try {
        const intent = await stripeClient.paymentIntents.retrieve(deal.stripePaymentId);
        result.liveStatus = intent.status;
        result.amountReceived = intent.amount_received;
      } catch {
        // Stripe unavailable, return cached status
      }
    }

    sendSuccess(res, result);
  } catch (error: any) {
    console.error('Get deal payment status error:', error.message);
    sendError(res, 500, 'Failed to get payment status.');
  }
}

module.exports = {
  createDealPaymentIntent,
  confirmDealPayment,
  getDealPaymentStatus,
};