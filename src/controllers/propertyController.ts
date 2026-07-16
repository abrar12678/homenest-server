export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const {
  isValidObjectId,
  buildPropertyFilter,
  buildSortFromQuery,
  parsePagination,
  sendError,
  sendSuccess,
  populatePostedBy,
} = require('../utils/helpers');

/**
 * GET /api/properties
 */
async function listProperties(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const collection = db.collection('properties');

    const filter = buildPropertyFilter(req.query);
    // Only show approved properties (or those without status field for backward compat)
    const statusFilter = [
      { status: 'approved' },
      { status: { $exists: false } },
    ];
    // If buildPropertyFilter created $or (for text search), combine with $and to avoid overwrite
    if (filter.$or) {
      filter.$and = [
        { $or: filter.$or },
        { $or: statusFilter },
      ];
      delete filter.$or;
    } else {
      filter.$or = statusFilter;
    }

    const sort = buildSortFromQuery(req.query.sortBy);
    const { page, limit, offset } = parsePagination(req.query);

    const total = await collection.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    const properties = await collection
      .find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray();

    const serialized = properties.map((p: any) => ({
      ...p,
      _id: p._id.toString(),
      postedBy: p.postedBy.toString(),
    }));

    await populatePostedBy(serialized, db);

    sendSuccess(res, {
      properties: serialized,
      total,
      page,
      totalPages,
    });
  } catch (error: any) {
    console.error('List properties error:', error);
    sendError(res, 500, 'Server error while fetching properties.');
  }
}

/**
 * GET /api/properties/featured
 * Returns top 4 most reviewed approved properties (always dynamic from DB)
 */
async function getFeaturedProperties(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const collection = db.collection('properties');

    // Get top 4 most reviewed approved properties via aggregation
    const pipeline = [
      {
        $match: {
          $or: [{ status: 'approved' }, { status: { $exists: false } }],
        },
      },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'propertyId',
          as: 'reviewData',
        },
      },
      {
        $addFields: {
          reviewCount: { $size: '$reviewData' },
        },
      },
      { $sort: { reviewCount: -1, rating: -1, createdAt: -1 } },
      { $limit: 4 },
      {
        $project: {
          reviewData: 0,
        },
      },
    ];

    const properties = await collection.aggregate(pipeline).toArray();

    const serialized = properties.map((p: any) => ({
      ...p,
      _id: p._id.toString(),
      postedBy: p.postedBy.toString(),
    }));

    await populatePostedBy(serialized, db);

    sendSuccess(res, { properties: serialized });
  } catch (error: any) {
    console.error('Featured properties error:', error);
    sendError(res, 500, 'Server error while fetching featured properties.');
  }
}

/**
 * GET /api/properties/:id
 */
async function getProperty(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid property ID.');
    }

    const db = getDB();
    const collection = db.collection('properties');

    const property = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    );

    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }

    const serialized: any = {
      ...property,
      _id: property._id.toString(),
      postedBy: property.postedBy.toString(),
    };

    await populatePostedBy([serialized], db);

    sendSuccess(res, { property: serialized });
  } catch (error: any) {
    console.error('Get property error:', error);
    sendError(res, 500, 'Server error while fetching property.');
  }
}

/**
 * POST /api/properties
 */
async function createProperty(req: any, res: any): Promise<void> {
  try {
    const {
      title,
      shortDescription,
      fullDescription,
      propertyType,
      price,
      priceType,
      location,
      bedrooms,
      bathrooms,
      area,
      amenities,
      images,
    } = req.body;

    if (!title || !title.trim()) {
      return sendError(res, 400, 'Property title is required.');
    }
    if (!shortDescription || !shortDescription.trim()) {
      return sendError(res, 400, 'Short description is required.');
    }
    if (!fullDescription || !fullDescription.trim()) {
      return sendError(res, 400, 'Full description is required.');
    }

    const validTypes = ['apartment', 'villa', 'commercial', 'land'];
    if (!propertyType || !validTypes.includes(propertyType)) {
      return sendError(res, 400, 'Valid property type is required (apartment, villa, commercial, land).');
    }
    if (!price || Number(price) <= 0) {
      return sendError(res, 400, 'A valid price is required.');
    }

    const validPriceTypes = ['monthly', 'total'];
    if (!priceType || !validPriceTypes.includes(priceType)) {
      return sendError(res, 400, 'Price type is required (monthly or total).');
    }
    if (!location || !location.city || !location.area) {
      return sendError(res, 400, 'Location with city and area is required.');
    }

    const db = getDB();
    const collection = db.collection('properties');

    const now = new Date().toISOString();
    const newProperty = {
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      fullDescription: fullDescription.trim(),
      propertyType,
      price: Number(price),
      priceType,
      location: {
        city: location.city.trim(),
        area: location.area.trim(),
      },
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      bathrooms: bathrooms ? Number(bathrooms) : undefined,
      area: area ? Number(area) : undefined,
      amenities: Array.isArray(amenities) ? amenities : [],
      images: Array.isArray(images) ? images : [],
      rating: 0,
      reviewCount: 0,
      views: 0,
      isFeatured: false,
      status: 'pending',
      postedBy: new ObjectId(req.user.userId),
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(newProperty);

    sendSuccess(res, {
      property: {
        ...newProperty,
        _id: result.insertedId.toString(),
        postedBy: { name: req.user.email, email: req.user.email, avatar: '', role: req.user.role },
      },
    }, 201);
  } catch (error: any) {
    console.error('Create property error:', error);
    sendError(res, 500, 'Server error while creating property.');
  }
}

/**
 * PUT /api/properties/:id — Update property (owner only)
 */
async function updateProperty(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid property ID.');
    }

    const db = getDB();
    const collection = db.collection('properties');

    const property = await collection.findOne({ _id: new ObjectId(id) });
    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }
    if (property.postedBy.toString() !== req.user.userId) {
      return sendError(res, 403, 'You are not authorized to update this property.');
    }

    const {
      title, shortDescription, fullDescription, propertyType,
      price, priceType, location, bedrooms, bathrooms, area, amenities, images,
    } = req.body;

    const updateFields: any = { updatedAt: new Date().toISOString() };

    if (title !== undefined) {
      if (!title.trim()) return sendError(res, 400, 'Property title is required.');
      updateFields.title = title.trim();
    }
    if (shortDescription !== undefined) {
      if (!shortDescription.trim()) return sendError(res, 400, 'Short description is required.');
      updateFields.shortDescription = shortDescription.trim();
    }
    if (fullDescription !== undefined) {
      if (!fullDescription.trim()) return sendError(res, 400, 'Full description is required.');
      updateFields.fullDescription = fullDescription.trim();
    }
    if (propertyType !== undefined) {
      const validTypes = ['apartment', 'villa', 'commercial', 'land'];
      if (!validTypes.includes(propertyType)) {
        return sendError(res, 400, 'Valid property type is required (apartment, villa, commercial, land).');
      }
      updateFields.propertyType = propertyType;
    }
    if (price !== undefined) {
      if (!price || Number(price) <= 0) return sendError(res, 400, 'A valid price is required.');
      updateFields.price = Number(price);
    }
    if (priceType !== undefined) {
      const validPriceTypes = ['monthly', 'total'];
      if (!validPriceTypes.includes(priceType)) {
        return sendError(res, 400, 'Price type is required (monthly or total).');
      }
      updateFields.priceType = priceType;
    }
    if (location !== undefined) {
      if (!location.city || !location.area) {
        return sendError(res, 400, 'Location with city and area is required.');
      }
      updateFields.location = { city: location.city.trim(), area: location.area.trim() };
    }
    if (bedrooms !== undefined) updateFields.bedrooms = bedrooms ? Number(bedrooms) : undefined;
    if (bathrooms !== undefined) updateFields.bathrooms = bathrooms ? Number(bathrooms) : undefined;
    if (area !== undefined) updateFields.area = area ? Number(area) : undefined;
    if (amenities !== undefined) updateFields.amenities = Array.isArray(amenities) ? amenities : [];
    if (images !== undefined) updateFields.images = Array.isArray(images) ? images : [];

    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const updated = await collection.findOne({ _id: new ObjectId(id) });
    const serialized: any = {
      ...updated,
      _id: updated._id.toString(),
      postedBy: updated.postedBy.toString(),
    };
    await populatePostedBy([serialized], db);

    sendSuccess(res, { property: serialized });
  } catch (error: any) {
    console.error('Update property error:', error);
    sendError(res, 500, 'Server error while updating property.');
  }
}

/**
 * GET /api/properties/user/my
 */
async function getMyProperties(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const collection = db.collection('properties');

    const properties = await collection
      .find({ postedBy: new ObjectId(req.user.userId) })
      .sort({ createdAt: -1 })
      .toArray();

    const serialized = properties.map((p: any) => ({
      ...p,
      _id: p._id.toString(),
      postedBy: p.postedBy.toString(),
    }));

    await populatePostedBy(serialized, db);

    sendSuccess(res, { properties: serialized });
  } catch (error: any) {
    console.error('Get my properties error:', error);
    sendError(res, 500, 'Server error while fetching your properties.');
  }
}

/**
 * DELETE /api/properties/:id
 */
async function deleteProperty(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid property ID.');
    }

    const db = getDB();
    const collection = db.collection('properties');

    const property = await collection.findOne({ _id: new ObjectId(id) });
    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }
    if (property.postedBy.toString() !== req.user.userId) {
      return sendError(res, 403, 'You are not authorized to delete this property.');
    }

    await collection.deleteOne({ _id: new ObjectId(id) });
    await db.collection('reviews').deleteMany({ propertyId: new ObjectId(id) });

    sendSuccess(res, { message: 'Property deleted successfully.' });
  } catch (error: any) {
    console.error('Delete property error:', error);
    sendError(res, 500, 'Server error while deleting property.');
  }
}

/**
 * GET /api/stats
 */
async function getStats(req: any, res: any): Promise<void> {
  try {
    const db = getDB();

    const [totalProperties, totalUsers, totalReviews] = await Promise.all([
      db.collection('properties').countDocuments(),
      db.collection('users').countDocuments(),
      db.collection('reviews').countDocuments(),
    ]);

    const cities = await db.collection('properties').distinct('location.city');

    // Property counts by type
    const typePipeline = [
      { $group: { _id: '$propertyType', count: { $sum: 1 } } },
    ];
    const typeCounts = await db.collection('properties').aggregate(typePipeline).toArray();
    const propertiesByType = typeCounts.map((t: any) => ({ _id: t._id, count: t.count }));

    // Recent top reviews for testimonials (latest 3 with rating >= 4)
    const recentReviews = await db.collection('reviews')
      .find({ rating: { $gte: 4 } })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();

    // Lookup property titles for each review
    const propertyIds = recentReviews
      .map((r: any) => r.propertyId)
      .filter((id: any) => id);
    const propertyDocs = propertyIds.length > 0
      ? await db.collection('properties')
          .find({ _id: { $in: propertyIds } })
          .project({ title: 1 })
          .toArray()
      : [];
    const propertyTitleMap = new Map(
      propertyDocs.map((p: any) => [p._id.toString(), p.title || ''])
    );

    sendSuccess(res, {
      totalProperties,
      totalUsers,
      totalReviews,
      totalCities: cities.length,
      propertiesByType,
      recentTestimonials: recentReviews.map((r: any) => ({
        _id: r._id.toString(),
        propertyId: r.propertyId?.toString() || '',
        propertyTitle: propertyTitleMap.get(r.propertyId?.toString()) || '',
        userId: r.userId?.toString() || '',
        userName: r.userName || 'Anonymous',
        rating: r.rating || 5,
        comment: r.comment || '',
        createdAt: r.createdAt || '',
      })),
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    sendError(res, 500, 'Server error while fetching stats.');
  }
}

module.exports = {
  listProperties,
  getFeaturedProperties,
  getProperty,
  createProperty,
  updateProperty,
  getMyProperties,
  deleteProperty,
  getStats,
};