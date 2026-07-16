export {};

/**
 * Remove password field from user object
 */
function sanitizeUser(user: any): any {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate MongoDB ObjectId
 */
function isValidObjectId(id: string): boolean {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  return objectIdRegex.test(id);
}

/**
 * Build a filter query for properties based on query params
 */
function buildPropertyFilter(query: any): any {
  const filter: any = {};

  // Text search on title and description
  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { shortDescription: { $regex: query.search, $options: 'i' } },
      { 'location.area': { $regex: query.search, $options: 'i' } },
    ];
  }

  // Filter by property type
  if (query.type) {
    filter.propertyType = query.type;
  }

  // Price range filter
  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) {
      filter.price.$gte = Number(query.minPrice);
    }
    if (query.maxPrice) {
      filter.price.$lte = Number(query.maxPrice);
    }
  }

  // Bedrooms filter
  if (query.bedrooms) {
    filter.bedrooms = Number(query.bedrooms);
  }

  // Minimum rating filter
  if (query.minRating) {
    filter.rating = { $gte: Number(query.minRating) };
  }

  // City filter
  if (query.city) {
    filter['location.city'] = query.city;
  }

  return filter;
}

/**
 * Build sort object from sortBy query param
 */
function buildSortFromQuery(sortBy: string | undefined): any {
  switch (sortBy) {
    case 'price_asc':
      return { price: 1 };
    case 'price_desc':
      return { price: -1 };
    case 'newest':
      return { createdAt: -1 };
    case 'popular':
      return { views: -1 };
    case 'rating':
      return { rating: -1 };
    default:
      return { createdAt: -1 };
  }
}

/**
 * Parse pagination params with defaults
 */
function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit as string, 10) || 12));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Send error response
 */
function sendError(res: any, statusCode: number, message: string): void {
  res.status(statusCode).json({
    success: false,
    message,
  });
}

/**
 * Populate postedBy field with user name/avatar from users collection
 */
async function populatePostedBy(properties: any[], db: any): Promise<void> {
  const { ObjectId } = require('mongodb');
  const userIds = [...new Set(properties.map((p: any) => p.postedBy).filter(Boolean))];
  if (userIds.length === 0) return;

  const users = await db.collection('users')
    .find({ _id: { $in: userIds.map((id: any) => new ObjectId(id)) } })
    .project({ name: 1, email: 1, avatar: 1, role: 1, phone: 1 })
    .toArray();

  const userMap = new Map(users.map((u: any) => [u._id.toString(), { name: u.name, email: u.email, avatar: u.avatar || '', role: u.role, phone: u.phone || '' }]));

  for (const p of properties) {
    const poster = userMap.get(p.postedBy);
    p.postedBy = poster || { name: 'Unknown', email: '', avatar: '', role: 'user', phone: '' };
  }
}

/**
 * Send success response
 */
function sendSuccess(res: any, data: any, statusCode: number = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
  });
}

module.exports = {
  sanitizeUser,
  isValidEmail,
  isValidObjectId,
  buildPropertyFilter,
  buildSortFromQuery,
  parsePagination,
  sendError,
  sendSuccess,
  populatePostedBy,
};