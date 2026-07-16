export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { isValidObjectId, sendError, sendSuccess, populatePostedBy } = require('../utils/helpers');

/**
 * GET /api/favorites — Get current user's favorite property IDs
 */
async function getFavorites(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const favorites = await db.collection('favorites')
      .find({ userId: new ObjectId(req.user.userId) })
      .sort({ createdAt: -1 })
      .toArray();

    // Get full property data
    const propIds = favorites.map((f: any) => f.propertyId);
    const properties = propIds.length > 0
      ? await db.collection('properties')
          .find({ _id: { $in: propIds }, $or: [{ status: 'approved' }, { status: { $exists: false } }] })
          .toArray()
      : [];

    const serialized = properties.map((p: any) => ({ ...p, _id: p._id.toString(), postedBy: p.postedBy.toString() }));
    await populatePostedBy(serialized, db);

    sendSuccess(res, { properties: serialized });
  } catch (error: any) {
    console.error('Get favorites error:', error);
    sendError(res, 500, 'Failed to fetch favorites.');
  }
}

/**
 * POST /api/favorites/:propertyId — Toggle favorite (add or remove)
 */
async function toggleFavorite(req: any, res: any): Promise<void> {
  try {
    const { propertyId } = req.params;
    if (!isValidObjectId(propertyId)) return sendError(res, 400, 'Invalid property ID.');

    const db = getDB();
    const userId = new ObjectId(req.user.userId);
    const propId = new ObjectId(propertyId);

    // Check property exists
    const property = await db.collection('properties').findOne({ _id: propId });
    if (!property) return sendError(res, 404, 'Property not found.');

    const existing = await db.collection('favorites').findOne({ userId, propertyId: propId });

    if (existing) {
      // Remove from favorites
      await db.collection('favorites').deleteOne({ userId, propertyId: propId });
      sendSuccess(res, { isFavorited: false });
    } else {
      // Add to favorites
      await db.collection('favorites').insertOne({
        userId,
        propertyId: propId,
        createdAt: new Date().toISOString(),
      });
      sendSuccess(res, { isFavorited: true });
    }
  } catch (error: any) {
    console.error('Toggle favorite error:', error);
    sendError(res, 500, 'Failed to toggle favorite.');
  }
}

/**
 * GET /api/favorites/check/:propertyId — Check if a property is favorited
 */
async function checkFavorite(req: any, res: any): Promise<void> {
  try {
    const { propertyId } = req.params;
    if (!isValidObjectId(propertyId)) return sendError(res, 400, 'Invalid property ID.');

    const db = getDB();
    const favorite = await db.collection('favorites').findOne({
      userId: new ObjectId(req.user.userId),
      propertyId: new ObjectId(propertyId),
    });

    sendSuccess(res, { isFavorited: !!favorite });
  } catch (error: any) {
    console.error('Check favorite error:', error);
    sendError(res, 500, 'Failed to check favorite.');
  }
}

module.exports = { getFavorites, toggleFavorite, checkFavorite };