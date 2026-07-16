export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { isValidObjectId, parsePagination, sendError, sendSuccess } = require('../utils/helpers');

const VALID_STATUSES = ['pending', 'countered', 'accepted', 'payment_pending', 'payment_verified', 'completed', 'rejected'];
const VALID_FINANCING_METHODS = ['cash', 'bank_transfer', 'loan', 'mortgage'];

/**
 * POST /api/deals — Buyer makes an offer on a property
 */
async function createDeal(req: any, res: any): Promise<void> {
  try {
    const { propertyId, offerAmount, message, financingMethod, phone } = req.body;

    if (!propertyId || !isValidObjectId(propertyId)) return sendError(res, 400, 'Valid property ID is required.');
    if (!offerAmount || typeof offerAmount !== 'number' || offerAmount <= 0) return sendError(res, 400, 'Offer amount must be a positive number.');
    if (!message || message.trim().length < 10) return sendError(res, 400, 'Message must be at least 10 characters.');
    if (!financingMethod || !VALID_FINANCING_METHODS.includes(financingMethod)) return sendError(res, 400, 'Financing method must be one of: cash, bank_transfer, loan, mortgage.');
    if (!phone || !phone.trim()) return sendError(res, 400, 'Phone number is required.');

    const db = getDB();

    // Check property exists and get details
    const property = await db.collection('properties').findOne({ _id: new ObjectId(propertyId) });
    if (!property) return sendError(res, 404, 'Property not found.');

    // Prevent self-deal
    if (property.postedBy.toString() === req.user.userId) {
      return sendError(res, 400, 'You cannot make an offer on your own property.');
    }

    // Prevent duplicate active deal
    const existingDeal = await db.collection('deals').findOne({
      buyerId: new ObjectId(req.user.userId),
      propertyId: new ObjectId(propertyId),
      status: { $nin: ['rejected', 'completed'] },
    });
    if (existingDeal) return sendError(res, 400, 'You already have an active deal for this property.');

    // Get buyer name
    const buyer = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { name: 1 } }
    );
    const buyerName = buyer?.name || req.user.email;

    // Get agent name
    const agent = await db.collection('users').findOne(
      { _id: property.postedBy },
      { projection: { name: 1 } }
    );
    const agentName = agent?.name || 'Unknown';

    const now = new Date().toISOString();
    const deal = {
      propertyId: new ObjectId(propertyId),
      propertyTitle: property.title,
      propertyImage: Array.isArray(property.images) && property.images.length > 0 ? property.images[0] : '',
      propertyPrice: property.price,
      buyerId: new ObjectId(req.user.userId),
      buyerName,
      buyerEmail: req.user.email,
      buyerPhone: phone.trim(),
      agentId: property.postedBy,
      agentName,
      offerAmount,
      finalAmount: offerAmount,
      message: message.trim(),
      financingMethod,
      status: 'pending',
      paymentMethod: '',
      paymentNote: '',
      history: [
        {
          action: 'offer_made',
          amount: offerAmount,
          message: message.trim(),
          byUserId: new ObjectId(req.user.userId),
          byUserName: buyerName,
          byRole: req.user.role,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('deals').insertOne(deal);

    sendSuccess(res, { deal: { ...deal, _id: result.insertedId.toString() } }, 201);
  } catch (error: any) {
    console.error('Create deal error:', error);
    sendError(res, 500, 'Failed to create deal.');
  }
}

/**
 * GET /api/deals/buyer — Buyer's deals
 */
async function getBuyerDeals(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const statusFilter = req.query.status || '';

    const filter: any = { buyerId: new ObjectId(req.user.userId) };
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await db.collection('deals').countDocuments(filter);
    const deals = await db.collection('deals')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Populate agent info
    const agentIds = [...new Set(deals.map((d: any) => d.agentId.toString()))];
    const agents = agentIds.length > 0 ? await db.collection('users')
      .find({ _id: { $in: agentIds.map((id: any) => new ObjectId(id)) } })
      .project({ name: 1, avatar: 1 }).toArray() : [];
    const agentMap = new Map(agents.map((a: any) => [a._id.toString(), { name: a.name, avatar: a.avatar || '' }]));

    sendSuccess(res, {
      deals: deals.map((d: any) => ({
        ...d,
        _id: d._id.toString(),
        propertyId: d.propertyId?.toString?.() || String(d.propertyId),
        buyerId: d.buyerId?.toString?.() || String(d.buyerId),
        agentId: d.agentId?.toString?.() || String(d.agentId),
        agent: agentMap.get(d.agentId.toString()) || { name: 'Unknown', avatar: '' },
        history: (d.history || []).map((h: any) => ({
          ...h,
          byUserId: h.byUserId?.toString?.() || String(h.byUserId),
        })),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Get buyer deals error:', error);
    sendError(res, 500, 'Failed to fetch deals.');
  }
}

/**
 * GET /api/deals/seller — Seller/agent's deals
 */
async function getSellerDeals(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const statusFilter = req.query.status || '';

    const filter: any = { agentId: new ObjectId(req.user.userId) };
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await db.collection('deals').countDocuments(filter);
    const deals = await db.collection('deals')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Get status counts for tabs
    const statusCounts = await db.collection('deals').aggregate([
      { $match: { agentId: new ObjectId(req.user.userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray();
    const countsMap = new Map(statusCounts.map((s: any) => [s._id, s.count]));

    // Populate buyer info
    const buyerIds = [...new Set(deals.map((d: any) => d.buyerId.toString()))];
    const buyers = buyerIds.length > 0 ? await db.collection('users')
      .find({ _id: { $in: buyerIds.map((id: any) => new ObjectId(id)) } })
      .project({ name: 1, email: 1 }).toArray() : [];
    const buyerMap = new Map(buyers.map((b: any) => [b._id.toString(), { name: b.name, email: b.email }]));

    sendSuccess(res, {
      deals: deals.map((d: any) => ({
        ...d,
        _id: d._id.toString(),
        propertyId: d.propertyId?.toString?.() || String(d.propertyId),
        buyerId: d.buyerId?.toString?.() || String(d.buyerId),
        agentId: d.agentId?.toString?.() || String(d.agentId),
        buyer: buyerMap.get(d.buyerId.toString()) || { name: 'Unknown', email: '' },
        history: (d.history || []).map((h: any) => ({
          ...h,
          byUserId: h.byUserId?.toString?.() || String(h.byUserId),
        })),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts: {
        pending: countsMap.get('pending') || 0,
        countered: countsMap.get('countered') || 0,
        accepted: countsMap.get('accepted') || 0,
        payment_pending: countsMap.get('payment_pending') || 0,
        payment_verified: countsMap.get('payment_verified') || 0,
        completed: countsMap.get('completed') || 0,
        rejected: countsMap.get('rejected') || 0,
      },
    });
  } catch (error: any) {
    console.error('Get seller deals error:', error);
    sendError(res, 500, 'Failed to fetch deals.');
  }
}

/**
 * PUT /api/deals/:id/counter — Agent counter-offers
 */
async function counterOffer(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { amount, message } = req.body;

    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');
    if (!amount || typeof amount !== 'number' || amount <= 0) return sendError(res, 400, 'Counter amount must be a positive number.');
    if (!message || !message.trim()) return sendError(res, 400, 'Counter message is required.');

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    // Only agent can counter
    if (deal.agentId.toString() !== req.user.userId) {
      return sendError(res, 403, 'Only the property agent can counter an offer.');
    }

    // Can only counter when pending or countered
    if (!['pending', 'countered'].includes(deal.status)) {
      return sendError(res, 400, 'Cannot counter this deal in its current status.');
    }

    // Get agent name for history
    const agent = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { name: 1 } }
    );
    const agentName = agent?.name || req.user.email;

    const now = new Date().toISOString();
    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          offerAmount: amount,
          finalAmount: amount,
          status: 'countered',
          updatedAt: now,
        },
        $push: {
          history: {
            action: 'countered',
            amount,
            message: message.trim(),
            byUserId: new ObjectId(req.user.userId),
            byUserName: agentName,
            byRole: req.user.role,
            createdAt: now,
          },
        },
      }
    );

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
    console.error('Counter offer error:', error);
    sendError(res, 500, 'Failed to counter offer.');
  }
}

/**
 * PUT /api/deals/:id/accept — Accept a deal
 */
async function acceptDeal(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    const userId = req.user.userId;
    const isBuyer = deal.buyerId.toString() === userId;
    const isAgent = deal.agentId.toString() === userId;
    if (!isBuyer && !isAgent) {
      return sendError(res, 403, 'You are not a participant in this deal.');
    }

    // Get user name for history
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { name: 1 } }
    );
    const userName = user?.name || req.user.email;

    const now = new Date().toISOString();
    let newStatus: string | null = null;
    let updateFields: any = { updatedAt: now };

    if (isAgent && ['pending', 'countered'].includes(deal.status)) {
      // Agent accepts pending or countered offer → accepted
      newStatus = 'accepted';
      updateFields.finalAmount = deal.offerAmount;
    } else if (isBuyer && deal.status === 'countered') {
      // Buyer accepts counter → accepted
      newStatus = 'accepted';
      updateFields.finalAmount = deal.offerAmount;
    } else if (isAgent && deal.status === 'payment_pending') {
      // Agent verifies payment → payment_verified
      newStatus = 'payment_verified';
    } else {
      return sendError(res, 400, 'Cannot accept this deal in its current status.');
    }

    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { ...updateFields, status: newStatus },
        $push: {
          history: {
            action: 'accepted',
            amount: updateFields.finalAmount || deal.offerAmount,
            message: `Deal accepted by ${isAgent ? 'agent' : 'buyer'}.`,
            byUserId: new ObjectId(userId),
            byUserName: userName,
            byRole: req.user.role,
            createdAt: now,
          },
        },
      }
    );

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
    console.error('Accept deal error:', error);
    sendError(res, 500, 'Failed to accept deal.');
  }
}

/**
 * PUT /api/deals/:id/reject — Reject a deal
 */
async function rejectDeal(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    const userId = req.user.userId;
    const isBuyer = deal.buyerId.toString() === userId;
    const isAgent = deal.agentId.toString() === userId;
    if (!isBuyer && !isAgent) {
      return sendError(res, 403, 'You are not a participant in this deal.');
    }

    if (!['pending', 'countered'].includes(deal.status)) {
      return sendError(res, 400, 'Cannot reject this deal in its current status.');
    }

    // Get user name for history
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { name: 1 } }
    );
    const userName = user?.name || req.user.email;

    const now = new Date().toISOString();
    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { status: 'rejected', updatedAt: now },
        $push: {
          history: {
            action: 'rejected',
            message: reason && reason.trim() ? reason.trim() : `Deal rejected by ${isAgent ? 'agent' : 'buyer'}.`,
            byUserId: new ObjectId(userId),
            byUserName: userName,
            byRole: req.user.role,
            createdAt: now,
          },
        },
      }
    );

    sendSuccess(res, { message: 'Deal rejected.' });
  } catch (error: any) {
    console.error('Reject deal error:', error);
    sendError(res, 500, 'Failed to reject deal.');
  }
}

/**
 * PUT /api/deals/:id/complete — Agent marks deal as completed
 */
async function completeDeal(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    // Only agent can complete
    if (deal.agentId.toString() !== req.user.userId) {
      return sendError(res, 403, 'Only the property agent can complete the deal.');
    }

    if (deal.status !== 'payment_verified') {
      return sendError(res, 400, 'Deal can only be completed after payment is verified.');
    }

    // Get agent name for history
    const agent = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { name: 1 } }
    );
    const agentName = agent?.name || req.user.email;

    const now = new Date().toISOString();

    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { status: 'completed', updatedAt: now },
        $push: {
          history: {
            action: 'completed',
            amount: deal.finalAmount,
            message: `Deal completed. Property sold for ${deal.finalAmount}.`,
            byUserId: new ObjectId(req.user.userId),
            byUserName: agentName,
            byRole: req.user.role,
            createdAt: now,
          },
        },
      }
    );

    // Mark property as sold
    await db.collection('properties').updateOne(
      { _id: deal.propertyId },
      {
        $set: {
          status: 'sold',
          soldPrice: deal.finalAmount,
          soldTo: deal.buyerId,
          updatedAt: now,
        },
      }
    );

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
    console.error('Complete deal error:', error);
    sendError(res, 500, 'Failed to complete deal.');
  }
}

/**
 * DELETE /api/deals/:id — Buyer withdraws deal
 */
async function withdrawDeal(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid deal ID.');

    const db = getDB();
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(id) });
    if (!deal) return sendError(res, 404, 'Deal not found.');

    // Only buyer can withdraw
    if (deal.buyerId.toString() !== req.user.userId) {
      return sendError(res, 403, 'Only the buyer can withdraw the deal.');
    }

    if (!['pending', 'countered'].includes(deal.status)) {
      return sendError(res, 400, 'Can only withdraw deals that are pending or countered.');
    }

    // Get buyer name for history
    const buyer = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { name: 1 } }
    );
    const buyerName = buyer?.name || req.user.email;

    const now = new Date().toISOString();
    await db.collection('deals').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { status: 'rejected', updatedAt: now },
        $push: {
          history: {
            action: 'withdrawn',
            message: 'Withdrawn by buyer',
            byUserId: new ObjectId(req.user.userId),
            byUserName: buyerName,
            byRole: req.user.role,
            createdAt: now,
          },
        },
      }
    );

    sendSuccess(res, { message: 'Deal withdrawn.' });
  } catch (error: any) {
    console.error('Withdraw deal error:', error);
    sendError(res, 500, 'Failed to withdraw deal.');
  }
}

module.exports = {
  createDeal,
  getBuyerDeals,
  getSellerDeals,
  counterOffer,
  acceptDeal,
  rejectDeal,
  completeDeal,
  withdrawDeal,
};