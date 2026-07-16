export {};

const stripe = require('stripe');
const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { sendError, sendSuccess, isValidObjectId } = require('../utils/helpers');

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
  : null;

/**
 * POST /api/payments/create-intent
 * Body: { propertyId, amount (in BDT, will be converted to cents) }
 */
async function createPaymentIntent(req: any, res: any): Promise<void> {
  try {
    const { propertyId, amount } = req.body;

    if (!propertyId || !isValidObjectId(propertyId)) {
      return sendError(res, 400, 'Valid property ID is required.');
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 400, 'A valid amount is required.');
    }

    if (!stripeClient) {
      return sendError(res, 500, 'Payment service is not configured.');
    }

    const db = getDB();
    const property = await db.collection('properties').findOne({
      _id: new ObjectId(propertyId),
    });

    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }

    if (property.postedBy.toString() !== req.user.userId) {
      return sendError(res, 403, 'You can only feature your own properties.');
    }

    // Amount in cents (Stripe requirement). Using 100 BDT = ~0.83 USD approximation.
    // We store amount in BDT, convert to USD cents for Stripe
    const amountInUsdCents = Math.round((numAmount / 120) * 100); // rough BDT to USD

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.max(amountInUsdCents, 50), // minimum $0.50
      currency: 'usd',
      metadata: {
        propertyId,
        userId: req.user.userId,
        amountBDT: String(numAmount),
      },
      automatic_payment_methods: { enabled: true },
    });

    sendSuccess(res, {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('Create payment intent error:', error.message);
    sendError(res, 500, 'Failed to create payment. Please try again.');
  }
}

/**
 * POST /api/payments/confirm
 * Body: { propertyId, paymentIntentId }
 */
async function confirmPayment(req: any, res: any): Promise<void> {
  try {
    const { propertyId, paymentIntentId } = req.body;

    if (!propertyId || !isValidObjectId(propertyId)) {
      return sendError(res, 400, 'Valid property ID is required.');
    }

    if (!stripeClient) {
      return sendError(res, 500, 'Payment service is not configured.');
    }

    // Verify payment intent succeeded
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return sendError(res, 400, 'Payment has not been completed.');
    }

    // Verify the property belongs to the user
    const db = getDB();
    const property = await db.collection('properties').findOne({
      _id: new ObjectId(propertyId),
    });

    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }

    if (property.postedBy.toString() !== req.user.userId) {
      return sendError(res, 403, 'Unauthorized.');
    }

    // Mark property as featured
    await db.collection('properties').updateOne(
      { _id: new ObjectId(propertyId) },
      {
        $set: {
          isFeatured: true,
          featuredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    // Record payment
    await db.collection('payments').insertOne({
      userId: new ObjectId(req.user.userId),
      propertyId: new ObjectId(propertyId),
      stripePaymentId: paymentIntentId,
      amount: Number(paymentIntent.metadata.amountBDT),
      currency: 'BDT',
      status: 'completed',
      createdAt: new Date().toISOString(),
    });

    sendSuccess(res, { message: 'Property featured successfully!' });
  } catch (error: any) {
    console.error('Confirm payment error:', error.message);
    sendError(res, 500, 'Failed to confirm payment.');
  }
}

module.exports = { createPaymentIntent, confirmPayment };