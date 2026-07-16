export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { isValidObjectId, parsePagination, sendError, sendSuccess, populatePostedBy } = require('../utils/helpers');

/**
 * POST /api/inquiries — Send inquiry to property agent
 */
async function createInquiry(req: any, res: any): Promise<void> {
  try {
    const { propertyId, message } = req.body;
    if (!propertyId || !isValidObjectId(propertyId)) return sendError(res, 400, 'Valid property ID is required.');
    if (!message || !message.trim()) return sendError(res, 400, 'Message is required.');

    const db = getDB();

    // Check property exists and get agent
    const property = await db.collection('properties').findOne({ _id: new ObjectId(propertyId) });
    if (!property) return sendError(res, 404, 'Property not found.');

    const toUserId = property.postedBy;

    // Prevent self-inquiry
    if (toUserId.toString() === req.user.userId) {
      return sendError(res, 400, 'You cannot send an inquiry on your own property.');
    }

    // Check for duplicate inquiry (same user + property, no reply yet)
    const existing = await db.collection('inquiries').findOne({
      fromUserId: new ObjectId(req.user.userId),
      propertyId: new ObjectId(propertyId),
      'replies.0': { $exists: false },
    });
    if (existing) return sendError(res, 400, 'You already have a pending inquiry for this property.');

    const now = new Date().toISOString();
    const inquiry = {
      propertyId: new ObjectId(propertyId),
      propertyTitle: property.title,
      fromUserId: new ObjectId(req.user.userId),
      fromUserName: req.user.name || req.user.email,
      fromUserEmail: req.user.email,
      toUserId,
      message: message.trim(),
      replies: [],
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('inquiries').insertOne(inquiry);

    sendSuccess(res, { inquiry: { ...inquiry, _id: result.insertedId.toString() } }, 201);
  } catch (error: any) {
    console.error('Create inquiry error:', error);
    sendError(res, 500, 'Failed to send inquiry.');
  }
}

/**
 * GET /api/inquiries/sent — Buyer's sent inquiries
 */
async function getSentInquiries(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);

    const total = await db.collection('inquiries').countDocuments({
      fromUserId: new ObjectId(req.user.userId),
    });

    const inquiries = await db.collection('inquiries')
      .find({ fromUserId: new ObjectId(req.user.userId) })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Get agent info for each inquiry
    const agentIds = [...new Set(inquiries.map((i: any) => i.toUserId.toString()))];
    const agents = agentIds.length > 0 ? await db.collection('users')
      .find({ _id: { $in: agentIds.map((id: any) => new ObjectId(id)) } })
      .project({ name: 1, avatar: 1 }).toArray() : [];
    const agentMap = new Map(agents.map((a: any) => [a._id.toString(), { name: a.name, avatar: a.avatar || '' }]));

    sendSuccess(res, {
      inquiries: inquiries.map((i: any) => ({
        ...i, _id: i._id.toString(), propertyId: i.propertyId.toString(),
        fromUserId: i.fromUserId.toString(), toUserId: i.toUserId.toString(),
        toAgent: agentMap.get(i.toUserId.toString()) || { name: 'Unknown', avatar: '' },
      })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Get sent inquiries error:', error);
    sendError(res, 500, 'Failed to fetch inquiries.');
  }
}

/**
 * GET /api/inquiries/received — Agent's received inquiries
 */
async function getReceivedInquiries(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);

    const filter: any = { toUserId: new ObjectId(req.user.userId) };
    const statusFilter = req.query.status;
    if (statusFilter && ['pending', 'replied'].includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await db.collection('inquiries').countDocuments(filter);

    const inquiries = await db.collection('inquiries')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    sendSuccess(res, {
      inquiries: inquiries.map((i: any) => ({
        ...i, _id: i._id.toString(), propertyId: i.propertyId.toString(),
        fromUserId: i.fromUserId.toString(), toUserId: i.toUserId.toString(),
      })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Get received inquiries error:', error);
    sendError(res, 500, 'Failed to fetch inquiries.');
  }
}

/**
 * PUT /api/inquiries/:id/reply — Either participant (buyer or agent) can reply
 */
async function replyToInquiry(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid inquiry ID.');
    if (!reply || !reply.trim()) return sendError(res, 400, 'Reply message is required.');

    const db = getDB();
    const inquiry = await db.collection('inquiries').findOne({ _id: new ObjectId(id) });

    if (!inquiry) return sendError(res, 404, 'Inquiry not found.');

    // Only the buyer (fromUserId) or the agent (toUserId) can reply
    const userId = req.user.userId;
    const isBuyer = inquiry.fromUserId.toString() === userId;
    const isAgent = inquiry.toUserId.toString() === userId;
    if (!isBuyer && !isAgent) {
      return sendError(res, 403, 'You are not a participant in this inquiry.');
    }

    const replyObj = {
      message: reply.trim(),
      repliedBy: new ObjectId(userId),
      repliedByName: req.user.name || req.user.email,
      repliedByRole: isBuyer ? 'user' : 'agent',
      createdAt: new Date().toISOString(),
    };

    await db.collection('inquiries').updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { replies: replyObj },
        $set: { status: 'replied', updatedAt: new Date().toISOString() },
      }
    );

    sendSuccess(res, { reply: replyObj });
  } catch (error: any) {
    console.error('Reply to inquiry error:', error);
    sendError(res, 500, 'Failed to reply to inquiry.');
  }
}

module.exports = { createInquiry, getSentInquiries, getReceivedInquiries, replyToInquiry };