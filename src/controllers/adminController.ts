export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const {
  isValidObjectId,
  parsePagination,
  sanitizeUser,
  sendError,
  sendSuccess,
  populatePostedBy,
} = require('../utils/helpers');

/**
 * GET /api/admin/stats — Platform-wide dashboard stats
 */
async function getAdminStats(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const [totalUsers, totalProperties, totalReviews, totalPayments, pendingProperties] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('properties').countDocuments({ $or: [{ status: 'approved' }, { status: { $exists: false } }] }),
      db.collection('reviews').countDocuments(),
      db.collection('payments').countDocuments({ status: 'succeeded' }),
      db.collection('properties').countDocuments({ status: 'pending' }),
    ]);

    const totalAgents = await db.collection('users').countDocuments({ role: 'agent' });
    const totalInquiries = await db.collection('inquiries').countDocuments();
    const totalRevenue = await db.collection('payments')
      .aggregate([{ $match: { status: 'succeeded' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      .toArray();

    const usersByRole = await db.collection('users').aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]).toArray();

    const propertiesByType = await db.collection('properties').aggregate([
      { $match: { $or: [{ status: 'approved' }, { status: { $exists: false } }] } },
      { $group: { _id: '$propertyType', count: { $sum: 1 } } },
    ]).toArray();

    const recentUsers = await db.collection('users')
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const recentProperties = await db.collection('properties')
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const serializedProps = recentProperties.map((p: any) => ({ ...p, _id: p._id.toString(), postedBy: p.postedBy?.toString?.() || String(p.postedBy) }));
    await populatePostedBy(serializedProps, db);

    // Monthly registration trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyUsers = await db.collection('users').aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo.toISOString() } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: { $toDate: '$createdAt' } } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();

    const monthlyProperties = await db.collection('properties').aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo.toISOString() } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: { $toDate: '$createdAt' } } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();

    // Deal stats
    const totalDeals = await db.collection('deals').countDocuments();
    const activeDealsAgg = await db.collection('deals').aggregate([
      { $match: { status: { $in: ['pending', 'countered', 'accepted', 'payment_pending', 'payment_verified'] } } },
      { $count: 'total' },
    ]).toArray();
    const activeDeals = activeDealsAgg[0]?.total || 0;

    const recentInquiries = await db.collection('inquiries')
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const inquiryPropIds = [...new Set(recentInquiries.map((i: any) => i.propertyId?.toString()).filter(Boolean))];
    const inquiryUserIds = [...new Set(recentInquiries.map((i: any) => i.fromUserId?.toString()).filter(Boolean))];
    const [inqProps, inqUsers] = await Promise.all([
      inquiryPropIds.length > 0 ? db.collection('properties').find({ _id: { $in: inquiryPropIds.map((id: any) => new ObjectId(id)) } }).project({ title: 1 }).toArray() : [],
      inquiryUserIds.length > 0 ? db.collection('users').find({ _id: { $in: inquiryUserIds.map((id: any) => new ObjectId(id)) } }).project({ name: 1 }).toArray() : [],
    ]);
    const inqPropMap = new Map(inqProps.map((p: any) => [p._id.toString(), p.title]));
    const inqUserMap = new Map(inqUsers.map((u: any) => [u._id.toString(), u.name]));

    sendSuccess(res, {
      totalUsers,
      totalAgents,
      totalProperties,
      totalReviews,
      totalPayments,
      totalInquiries,
      pendingProperties,
      totalDeals,
      activeDeals,
      totalRevenue: totalRevenue[0]?.total || 0,
      usersByRole,
      propertiesByType,
      recentUsers: recentUsers.map((u: any) => ({ ...sanitizeUser(u), _id: u._id.toString() })),
      recentProperties: serializedProps,
      monthlyUsers: monthlyUsers.map((m: any) => ({ month: m._id, count: m.count })),
      monthlyProperties: monthlyProperties.map((m: any) => ({ month: m._id, count: m.count })),
      recentInquiries: recentInquiries.map((i: any) => ({
        ...i,
        _id: i._id.toString(),
        propertyId: i.propertyId?.toString?.() || String(i.propertyId),
        fromUserId: i.fromUserId?.toString?.() || String(i.fromUserId),
        toUserId: i.toUserId?.toString?.() || String(i.toUserId),
        propertyTitle: inqPropMap.get(i.propertyId?.toString?.() || '') || 'Unknown',
        fromUserName: inqUserMap.get(i.fromUserId?.toString?.() || '') || 'Unknown',
      })),
    });
  } catch (error: any) {
    console.error('Admin stats error:', error);
    sendError(res, 500, 'Failed to fetch admin stats.');
  }
}

/**
 * GET /api/admin/users — List all users (paginated, searchable)
 */
async function getUsers(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.search || '';
    const role = req.query.role || '';

    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) filter.role = role;

    const total = await db.collection('users').countDocuments(filter);
    const users = await db.collection('users')
      .find(filter, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    sendSuccess(res, {
      users: users.map((u: any) => ({ ...sanitizeUser(u), _id: u._id.toString() })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Admin get users error:', error);
    sendError(res, 500, 'Failed to fetch users.');
  }
}

/**
 * PUT /api/admin/users/:id/role — Change user role
 */
async function updateUserRole(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid user ID.');
    const validRoles = ['user', 'agent', 'admin'];
    if (!role || !validRoles.includes(role)) return sendError(res, 400, 'Invalid role. Must be user, agent, or admin.');

    const db = getDB();
    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { role, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );

    if (!result) return sendError(res, 404, 'User not found.');

    sendSuccess(res, { user: sanitizeUser({ ...result, _id: result._id.toString() }) });
  } catch (error: any) {
    console.error('Admin update user role error:', error);
    sendError(res, 500, 'Failed to update user role.');
  }
}

/**
 * PUT /api/admin/users/:id/ban — Ban/unban user
 */
async function toggleBanUser(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid user ID.');

    // Cannot ban yourself
    if (id === req.user.userId) return sendError(res, 400, 'You cannot ban yourself.');

    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    if (!user) return sendError(res, 404, 'User not found.');

    const newBannedStatus = !user.isBanned;
    await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: { isBanned: newBannedStatus, updatedAt: new Date().toISOString() } }
    );

    sendSuccess(res, { isBanned: newBannedStatus });
  } catch (error: any) {
    console.error('Admin ban user error:', error);
    sendError(res, 500, 'Failed to update ban status.');
  }
}

/**
 * DELETE /api/admin/users/:id — Delete user
 */
async function deleteUser(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid user ID.');
    if (id === req.user.userId) return sendError(res, 400, 'You cannot delete yourself.');

    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    if (!user) return sendError(res, 404, 'User not found.');

    await db.collection('users').deleteOne({ _id: new ObjectId(id) });
    // Cascade: delete their properties, reviews, inquiries, favorites
    const propIds = (await db.collection('properties').find({ postedBy: new ObjectId(id) }).project({ _id: 1 }).toArray()).map((p: any) => p._id);
    if (propIds.length > 0) {
      await db.collection('properties').deleteMany({ postedBy: new ObjectId(id) });
      await db.collection('reviews').deleteMany({ propertyId: { $in: propIds } });
    }
    await db.collection('reviews').deleteMany({ userId: new ObjectId(id) });
    await db.collection('inquiries').deleteMany({ $or: [{ fromUserId: new ObjectId(id) }, { toUserId: new ObjectId(id) }] });
    await db.collection('favorites').deleteMany({ userId: new ObjectId(id) });

    sendSuccess(res, { message: 'User and all related data deleted.' });
  } catch (error: any) {
    console.error('Admin delete user error:', error);
    sendError(res, 500, 'Failed to delete user.');
  }
}

/**
 * GET /api/admin/properties — All properties (with status filter, pagination)
 */
async function getProperties(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const status = req.query.status || '';
    const search = req.query.search || '';

    const filter: any = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'location.area': { $regex: search, $options: 'i' } },
      ];
    }

    const total = await db.collection('properties').countDocuments(filter);
    const properties = await db.collection('properties')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    const serialized = properties.map((p: any) => ({ ...p, _id: p._id.toString(), postedBy: p.postedBy.toString() }));
    await populatePostedBy(serialized, db);

    sendSuccess(res, { properties: serialized, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error('Admin get properties error:', error);
    sendError(res, 500, 'Failed to fetch properties.');
  }
}

/**
 * PUT /api/admin/properties/:id/status — Approve/reject property
 */
async function updatePropertyStatus(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid property ID.');
    if (!['approved', 'rejected', 'pending'].includes(status)) return sendError(res, 400, 'Invalid status.');

    const db = getDB();
    const result = await db.collection('properties').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    if (!result) return sendError(res, 404, 'Property not found.');

    sendSuccess(res, { property: { ...result, _id: result._id.toString() } });
  } catch (error: any) {
    console.error('Admin update property status error:', error);
    sendError(res, 500, 'Failed to update property status.');
  }
}

/**
 * DELETE /api/admin/properties/:id — Admin delete any property
 */
async function deleteProperty(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid property ID.');

    const db = getDB();
    const property = await db.collection('properties').findOne({ _id: new ObjectId(id) });
    if (!property) return sendError(res, 404, 'Property not found.');

    await db.collection('properties').deleteOne({ _id: new ObjectId(id) });
    await db.collection('reviews').deleteMany({ propertyId: new ObjectId(id) });
    await db.collection('inquiries').deleteMany({ propertyId: new ObjectId(id) });
    await db.collection('favorites').deleteMany({ propertyId: new ObjectId(id) });

    sendSuccess(res, { message: 'Property deleted successfully.' });
  } catch (error: any) {
    console.error('Admin delete property error:', error);
    sendError(res, 500, 'Failed to delete property.');
  }
}

/**
 * GET /api/admin/reviews — All reviews (paginated)
 */
async function getReviews(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.search || '';

    const filter: any = {};
    if (search) {
      const propIds = await db.collection('properties').find({ title: { $regex: search, $options: 'i' } }).project({ _id: 1 }).toArray();
      const propIdSet = propIds.map((p: any) => p._id);
      filter.$or = [
        { 'userId.name': { $regex: search, $options: 'i' } },
        { comment: { $regex: search, $options: 'i' } },
      ];
      if (propIdSet.length > 0) {
        filter.$or.push({ propertyId: { $in: propIdSet } });
      }
    }

    const total = await db.collection('reviews').countDocuments(filter);
    const reviews = await db.collection('reviews')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Get property titles
    const propIds = [...new Set(reviews.map((r: any) => r.propertyId.toString()))];
    const props = propIds.length > 0 ? await db.collection('properties')
      .find({ _id: { $in: propIds.map((id: any) => new ObjectId(id)) } })
      .project({ title: 1 }).toArray() : [];
    const propMap = new Map(props.map((p: any) => [p._id.toString(), p.title]));

    sendSuccess(res, {
      reviews: reviews.map((r: any) => ({
        ...r, _id: r._id.toString(), propertyId: r.propertyId.toString(), userId: r.userId.toString(),
        propertyTitle: propMap.get(r.propertyId.toString()) || 'Unknown',
      })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Admin get reviews error:', error);
    sendError(res, 500, 'Failed to fetch reviews.');
  }
}

/**
 * DELETE /api/admin/reviews/:id — Delete a review
 */
async function deleteReview(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid review ID.');

    const db = getDB();
    const review = await db.collection('reviews').findOne({ _id: new ObjectId(id) });
    if (!review) return sendError(res, 404, 'Review not found.');

    await db.collection('reviews').deleteOne({ _id: new ObjectId(id) });

    // Recalculate property rating
    const agg = await db.collection('reviews').aggregate([
      { $match: { propertyId: review.propertyId } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();

    await db.collection('properties').updateOne(
      { _id: review.propertyId },
      { $set: {
        rating: agg[0]?.avgRating || 0,
        reviewCount: agg[0]?.count || 0,
        updatedAt: new Date().toISOString(),
      }}
    );

    sendSuccess(res, { message: 'Review deleted.' });
  } catch (error: any) {
    console.error('Admin delete review error:', error);
    sendError(res, 500, 'Failed to delete review.');
  }
}

/**
 * GET /api/admin/messages — All contact messages (paginated)
 */
async function getMessages(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.search || '';

    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await db.collection('contactMessages').countDocuments(filter);
    const messages = await db.collection('contactMessages')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    sendSuccess(res, {
      messages: messages.map((m: any) => ({ ...m, _id: m._id.toString() })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Admin get messages error:', error);
    sendError(res, 500, 'Failed to fetch messages.');
  }
}

/**
 * DELETE /api/admin/messages/:id — Delete a contact message
 */
async function deleteMessage(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid message ID.');

    const db = getDB();
    const result = await db.collection('contactMessages').deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return sendError(res, 404, 'Message not found.');

    sendSuccess(res, { message: 'Message deleted.' });
  } catch (error: any) {
    console.error('Admin delete message error:', error);
    sendError(res, 500, 'Failed to delete message.');
  }
}

/**
 * GET /api/admin/payments — Payment history (paginated)
 */
async function getPayments(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);

    // Get overall totals
    const [total, totalRevenueAgg] = await Promise.all([
      db.collection('payments').countDocuments(),
      db.collection('payments').aggregate([
        { $match: { status: { $in: ['succeeded', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]).toArray(),
    ]);
    const payments = await db.collection('payments')
      .find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Enrich with user and property info
    const userIds = [...new Set(payments.map((p: any) => p.userId?.toString()).filter(Boolean))];
    const propIds = [...new Set(payments.map((p: any) => p.propertyId?.toString()).filter(Boolean))];

    const [users, props] = await Promise.all([
      userIds.length > 0 ? db.collection('users').find({ _id: { $in: userIds.map((id: any) => new ObjectId(id)) } }).project({ name: 1, email: 1 }).toArray() : [],
      propIds.length > 0 ? db.collection('properties').find({ _id: { $in: propIds.map((id: any) => new ObjectId(id)) } }).project({ title: 1 }).toArray() : [],
    ]);

    const userMap = new Map(users.map((u: any) => [u._id.toString(), u.name]));
    const propMap = new Map(props.map((p: any) => [p._id.toString(), p.title]));

    sendSuccess(res, {
      payments: payments.map((p: any) => ({
        ...p, _id: p._id.toString(),
        userId: p.userId?.toString(), propertyId: p.propertyId?.toString(),
        dealId: p.dealId?.toString(),
        userName: userMap.get(p.userId?.toString()) || 'Unknown',
        propertyTitle: propMap.get(p.propertyId?.toString()) || 'Unknown',
      })),
      total, page, totalPages: Math.ceil(total / limit),
      totalRevenue: totalRevenueAgg[0]?.total || 0,
      totalTransactions: totalRevenueAgg[0]?.count || 0,
    });
  } catch (error: any) {
    console.error('Admin get payments error:', error);
    sendError(res, 500, 'Failed to fetch payments.');
  }
}

/**
 * GET /api/admin/inquiries — All platform inquiries (paginated)
 */
async function getInquiries(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.search || '';

    const filter: any = {};
    if (search) {
      const propIds = await db.collection('properties').find({ title: { $regex: search, $options: 'i' } }).project({ _id: 1 }).toArray();
      const propIdSet = propIds.map((p: any) => p._id);
      filter.$or = [
        { message: { $regex: search, $options: 'i' } },
      ];
      if (propIdSet.length > 0) {
        filter.$or.push({ propertyId: { $in: propIdSet } });
      }
    }

    const total = await db.collection('inquiries').countDocuments(filter);
    const inquiries = await db.collection('inquiries')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Enrich with property and user info
    const inquiryPropIds = [...new Set(inquiries.map((i: any) => i.propertyId?.toString()).filter(Boolean))];
    const fromUserIds = [...new Set(inquiries.map((i: any) => i.fromUserId?.toString()).filter(Boolean))];
    const toUserIds = [...new Set(inquiries.map((i: any) => i.toUserId?.toString()).filter(Boolean))];

    const [props, fromUsers, toUsers] = await Promise.all([
      inquiryPropIds.length > 0 ? db.collection('properties').find({ _id: { $in: inquiryPropIds.map((id: any) => new ObjectId(id)) } }).project({ title: 1 }).toArray() : [],
      fromUserIds.length > 0 ? db.collection('users').find({ _id: { $in: fromUserIds.map((id: any) => new ObjectId(id)) } }).project({ name: 1, email: 1 }).toArray() : [],
      toUserIds.length > 0 ? db.collection('users').find({ _id: { $in: toUserIds.map((id: any) => new ObjectId(id)) } }).project({ name: 1, email: 1 }).toArray() : [],
    ]);

    const propMap = new Map(props.map((p: any) => [p._id.toString(), p.title]));
    const fromUserMap = new Map(fromUsers.map((u: any) => [u._id.toString(), { name: u.name, email: u.email }]));
    const toUserMap = new Map(toUsers.map((u: any) => [u._id.toString(), { name: u.name, email: u.email }]));

    sendSuccess(res, {
      inquiries: inquiries.map((i: any) => ({
        ...i, _id: i._id.toString(),
        propertyId: i.propertyId?.toString?.() || String(i.propertyId),
        fromUserId: i.fromUserId?.toString?.() || String(i.fromUserId),
        toUserId: i.toUserId?.toString?.() || String(i.toUserId),
        propertyTitle: propMap.get(i.propertyId?.toString?.() || '') || 'Unknown',
        fromUserName: fromUserMap.get(i.fromUserId?.toString?.() || '')?.name || 'Unknown',
        fromUserEmail: fromUserMap.get(i.fromUserId?.toString?.() || '')?.email || '',
        toAgentName: toUserMap.get(i.toUserId?.toString?.() || '')?.name || 'Unknown',
      })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Admin get inquiries error:', error);
    sendError(res, 500, 'Failed to fetch inquiries.');
  }
}

/**
 * DELETE /api/admin/inquiries/:id — Delete an inquiry
 */
async function deleteInquiry(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid inquiry ID.');

    const db = getDB();
    const result = await db.collection('inquiries').deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return sendError(res, 404, 'Inquiry not found.');

    sendSuccess(res, { message: 'Inquiry deleted.' });
  } catch (error: any) {
    console.error('Admin delete inquiry error:', error);
    sendError(res, 500, 'Failed to delete inquiry.');
  }
}

/**
 * GET /api/admin/deals — All platform deals (paginated, filterable)
 */
async function getDeals(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const status = req.query.status || '';
    const search = req.query.search || '';

    const filter: any = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { propertyTitle: { $regex: search, $options: 'i' } },
        { buyerName: { $regex: search, $options: 'i' } },
        { agentName: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await db.collection('deals').countDocuments(filter);
    const deals = await db.collection('deals')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    sendSuccess(res, {
      deals: deals.map((d: any) => ({
        ...d,
        _id: d._id.toString(),
        propertyId: d.propertyId?.toString?.() || String(d.propertyId),
        buyerId: d.buyerId?.toString?.() || String(d.buyerId),
        agentId: d.agentId?.toString?.() || String(d.agentId),
        history: (d.history || []).map((h: any) => ({
          ...h,
          byUserId: h.byUserId?.toString?.() || String(h.byUserId),
        })),
      })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Admin get deals error:', error);
    sendError(res, 500, 'Failed to fetch deals.');
  }
}

/**
 * DELETE /api/admin/deals/:id — Delete a deal
 */
async function deleteDeal(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    const db = getDB();
    const result = await db.collection('deals').deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return sendError(res, 404, 'Deal not found.');

    sendSuccess(res, { message: 'Deal deleted.' });
  } catch (error: any) {
    console.error('Admin delete deal error:', error);
    sendError(res, 500, 'Failed to delete deal.');
  }
}

module.exports = {
  getAdminStats, getUsers, updateUserRole, toggleBanUser, deleteUser,
  getProperties, updatePropertyStatus, deleteProperty,
  getReviews, deleteReview,
  getMessages, deleteMessage,
  getPayments,
  getInquiries, deleteInquiry,
  getDeals, deleteDeal,
};