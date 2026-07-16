export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { isValidObjectId, sendError, sendSuccess } = require('../utils/helpers');

/**
 * GET /api/reviews/:propertyId
 * Get all reviews for a specific property
 */
async function getPropertyReviews(req: any, res: any): Promise<void> {
  try {
    const { propertyId } = req.params;

    if (!isValidObjectId(propertyId)) {
      return sendError(res, 400, 'Invalid property ID.');
    }

    const db = getDB();
    const reviewsCollection = db.collection('reviews');
    const propertiesCollection = db.collection('properties');

    // Verify property exists
    const property = await propertiesCollection.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }

    // Fetch reviews sorted by newest first
    const reviews = await reviewsCollection
      .find({ propertyId: new ObjectId(propertyId) })
      .sort({ createdAt: -1 })
      .toArray();

    const serialized = reviews.map((r: any) => ({
      ...r,
      _id: r._id.toString(),
      propertyId: r.propertyId.toString(),
      userId: r.userId.toString(),
    }));

    sendSuccess(res, { reviews: serialized });
  } catch (error: any) {
    console.error('Get reviews error:', error);
    sendError(res, 500, 'Server error while fetching reviews.');
  }
}

/**
 * POST /api/reviews
 * Add a review for a property (auth required)
 * Also updates the property's average rating and review count
 */
async function addReview(req: any, res: any): Promise<void> {
  try {
    const { propertyId, rating, comment } = req.body;

    // Validate required fields
    if (!propertyId) {
      return sendError(res, 400, 'Property ID is required.');
    }

    if (!isValidObjectId(propertyId)) {
      return sendError(res, 400, 'Invalid property ID.');
    }

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      return sendError(res, 400, 'Rating must be between 1 and 5.');
    }

    if (!comment || !comment.trim()) {
      return sendError(res, 400, 'Review comment is required.');
    }

    const db = getDB();
    const reviewsCollection = db.collection('reviews');
    const propertiesCollection = db.collection('properties');
    const usersCollection = db.collection('users');

    // Verify property exists
    const property = await propertiesCollection.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }

    // Get user info
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) {
      return sendError(res, 404, 'User not found.');
    }

    // Check if user already reviewed this property
    const existingReview = await reviewsCollection.findOne({
      propertyId: new ObjectId(propertyId),
      userId: new ObjectId(req.user.userId),
    });

    if (existingReview) {
      return sendError(res, 400, 'You have already reviewed this property.');
    }

    // Create the review
    const now = new Date().toISOString();
    const newReview = {
      propertyId: new ObjectId(propertyId),
      userId: new ObjectId(req.user.userId),
      userName: user.name,
      rating: Number(rating),
      comment: comment.trim(),
      createdAt: now,
    };

    const result = await reviewsCollection.insertOne(newReview);

    // Recalculate average rating and review count for the property
    const allReviews = await reviewsCollection.find({ propertyId: new ObjectId(propertyId) }).toArray();
    const totalRating = allReviews.reduce((sum: number, r: any) => sum + r.rating, 0);
    const avgRating = Math.round((totalRating / allReviews.length) * 10) / 10;

    await propertiesCollection.updateOne(
      { _id: new ObjectId(propertyId) },
      {
        $set: {
          rating: avgRating,
          reviewCount: allReviews.length,
          updatedAt: now,
        },
      }
    );

    const serialized = {
      ...newReview,
      _id: result.insertedId.toString(),
      propertyId: propertyId,
      userId: req.user.userId,
    };

    sendSuccess(res, { review: serialized }, 201);
  } catch (error: any) {
    // Handle duplicate key error (unique index on propertyId + userId)
    if (error.code === 11000) {
      return sendError(res, 400, 'You have already reviewed this property.');
    }
    console.error('Add review error:', error);
    sendError(res, 500, 'Server error while adding review.');
  }
}

/**
 * GET /api/reviews/my/count — Get current user's review count
 */
async function getMyReviewCount(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const count = await db.collection('reviews').countDocuments({
      userId: new ObjectId(req.user.userId),
    });
    sendSuccess(res, { count });
  } catch (error: any) {
    console.error('Get my review count error:', error);
    sendError(res, 500, 'Failed to fetch review count.');
  }
}

module.exports = { getPropertyReviews, addReview, getMyReviewCount };