export {};

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { isValidObjectId, parsePagination, sendError, sendSuccess } = require('../utils/helpers');

/**
 * POST /api/visits — Schedule a visit
 */
async function scheduleVisit(req: any, res: any): Promise<void> {
  try {
    const { propertyId, preferredDate, preferredTime, name, phone, message } = req.body;

    if (!propertyId || !isValidObjectId(propertyId)) {
      return sendError(res, 400, 'Valid property ID is required.');
    }

    if (!preferredDate || !preferredDate.trim()) {
      return sendError(res, 400, 'Preferred date is required.');
    }

    // Validate date format (YYYY-MM-DD) and ensure it's in the future
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(preferredDate)) {
      return sendError(res, 400, 'Please provide a valid date in YYYY-MM-DD format.');
    }

    const selectedDate = new Date(preferredDate + 'T00:00:00.000Z');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      return sendError(res, 400, 'Please select a future date for the visit.');
    }

    // Validate time slot
    const validTimeSlots = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];
    if (preferredTime && !validTimeSlots.includes(preferredTime)) {
      return sendError(res, 400, 'Please select a valid time slot.');
    }

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Your name is required.');
    }

    if (!phone || !phone.trim()) {
      return sendError(res, 400, 'Phone number is required.');
    }

    // Validate phone format (basic check for digits, +, -, spaces, min 7 chars)
    const phoneRegex = /^[+\-\s()0-9]{7,20}$/;
    if (!phoneRegex.test(phone.trim())) {
      return sendError(res, 400, 'Please provide a valid phone number.');
    }

    if (message && message.length > 500) {
      return sendError(res, 400, 'Message must be 500 characters or less.');
    }

    const db = getDB();

    // Check property exists and get agent
    const property = await db.collection('properties').findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return sendError(res, 404, 'Property not found.');
    }

    // Prevent self-visit
    if (property.postedBy.toString() === req.user.userId) {
      return sendError(res, 400, 'You cannot schedule a visit on your own property.');
    }

    // Check for existing visit on same date/time/property (prevent duplicates)
    const existingVisit = await db.collection('visits').findOne({
      propertyId: new ObjectId(propertyId),
      visitorId: new ObjectId(req.user.userId),
      preferredDate: preferredDate.trim(),
      preferredTime: preferredTime || null,
      status: { $in: ['pending', 'confirmed'] },
    });

    if (existingVisit) {
      return sendError(res, 400, 'You already have a visit scheduled for this property on this date and time.');
    }

    const now = new Date().toISOString();
    const visit = {
      propertyId: new ObjectId(propertyId),
      propertyTitle: property.title,
      propertyImage: property.images?.[0] || '',
      visitorId: new ObjectId(req.user.userId),
      visitorName: name.trim(),
      visitorEmail: req.user.email,
      visitorPhone: phone.trim(),
      ownerId: property.postedBy,
      preferredDate: preferredDate.trim(),
      preferredTime: preferredTime || null,
      message: message ? message.trim() : '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('visits').insertOne(visit);

    sendSuccess(res, {
      visit: {
        ...visit,
        _id: result.insertedId.toString(),
        visitorId: visit.visitorId.toString(),
        ownerId: visit.ownerId.toString(),
        propertyId: visit.propertyId.toString(),
      },
    }, 201);
  } catch (error: any) {
    console.error('Schedule visit error:', error);
    sendError(res, 500, 'Failed to schedule visit. Please try again.');
  }
}

/**
 * GET /api/visits/my — Get my scheduled visits (buyer side)
 */
async function getMyVisits(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);

    const filter: any = { visitorId: new ObjectId(req.user.userId) };
    const statusFilter = req.query.status;
    if (statusFilter && ['pending', 'confirmed', 'completed', 'cancelled'].includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await db.collection('visits').countDocuments(filter);

    const visits = await db.collection('visits')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Get property owner info
    const ownerIds = [...new Set(visits.map((v: any) => v.ownerId.toString()))];
    const owners = ownerIds.length > 0 ? await db.collection('users')
      .find({ _id: { $in: ownerIds.map((id: any) => new ObjectId(id)) } })
      .project({ name: 1, avatar: 1, phone: 1 }).toArray() : [];
    const ownerMap = new Map(owners.map((o: any) => [o._id.toString(), { name: o.name, avatar: o.avatar || '', phone: o.phone || '' }]));

    sendSuccess(res, {
      visits: visits.map((v: any) => ({
        ...v,
        _id: v._id.toString(),
        visitorId: v.visitorId.toString(),
        ownerId: v.ownerId.toString(),
        propertyId: v.propertyId.toString(),
        owner: ownerMap.get(v.ownerId.toString()) || { name: 'Unknown', avatar: '', phone: '' },
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Get my visits error:', error);
    sendError(res, 500, 'Failed to fetch your visits.');
  }
}

/**
 * GET /api/visits/received — Get visits for my properties (agent side)
 */
async function getReceivedVisits(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const { page, limit, offset } = parsePagination(req.query);
    const statusFilter = req.query.status;

    const filter: any = { ownerId: new ObjectId(req.user.userId) };
    if (statusFilter && ['pending', 'confirmed', 'completed', 'cancelled'].includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await db.collection('visits').countDocuments(filter);

    const visits = await db.collection('visits')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // Get visitor info
    const visitorIds = [...new Set(visits.map((v: any) => v.visitorId.toString()))];
    const visitors = visitorIds.length > 0 ? await db.collection('users')
      .find({ _id: { $in: visitorIds.map((id: any) => new ObjectId(id)) } })
      .project({ name: 1, avatar: 1, email: 1 }).toArray() : [];
    const visitorMap = new Map(visitors.map((u: any) => [u._id.toString(), { name: u.name, avatar: u.avatar || '', email: u.email || '' }]));

    // Get status counts for all tabs
    const statusCountsPipeline = [
      { $match: { ownerId: new ObjectId(req.user.userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const statusCountsArr = await db.collection('visits').aggregate(statusCountsPipeline).toArray();
    const statusCounts: Record<string, number> = {};
    for (const sc of statusCountsArr) {
      if (sc._id) statusCounts[sc._id] = sc.count;
    }

    sendSuccess(res, {
      visits: visits.map((v: any) => ({
        ...v,
        _id: v._id.toString(),
        visitorId: v.visitorId.toString(),
        ownerId: v.ownerId.toString(),
        propertyId: v.propertyId.toString(),
        visitor: visitorMap.get(v.visitorId.toString()) || { name: v.visitorName, avatar: '', email: v.visitorEmail || '' },
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts,
    });
  } catch (error: any) {
    console.error('Get received visits error:', error);
    sendError(res, 500, 'Failed to fetch visit requests.');
  }
}

/**
 * PATCH /api/visits/:id/status — Update visit status (agent only)
 */
async function updateVisitStatus(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid visit ID.');
    }

    const validStatuses = ['confirmed', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return sendError(res, 400, `Status must be one of: ${validStatuses.join(', ')}`);
    }

    const db = getDB();
    const visit = await db.collection('visits').findOne({ _id: new ObjectId(id) });

    if (!visit) {
      return sendError(res, 404, 'Visit not found.');
    }

    // Only the property owner can update visit status
    if (visit.ownerId.toString() !== req.user.userId) {
      return sendError(res, 403, 'You can only manage visits for your own properties.');
    }

    // Validate status transitions
    if (visit.status === 'cancelled') {
      return sendError(res, 400, 'Cannot update a cancelled visit.');
    }
    if (visit.status === 'completed' && status !== 'cancelled') {
      return sendError(res, 400, 'Cannot change status of a completed visit.');
    }

    await db.collection('visits').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    sendSuccess(res, { message: `Visit ${status} successfully.` });
  } catch (error: any) {
    console.error('Update visit status error:', error);
    sendError(res, 500, 'Failed to update visit status.');
  }
}

/**
 * DELETE /api/visits/:id — Cancel own visit (visitor)
 */
async function cancelMyVisit(req: any, res: any): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid visit ID.');
    }

    const db = getDB();
    const visit = await db.collection('visits').findOne({ _id: new ObjectId(id) });

    if (!visit) {
      return sendError(res, 404, 'Visit not found.');
    }

    // Only the visitor can cancel their own visit
    if (visit.visitorId.toString() !== req.user.userId) {
      return sendError(res, 403, 'You can only cancel your own visits.');
    }

    if (visit.status === 'cancelled' || visit.status === 'completed') {
      return sendError(res, 400, `Cannot cancel a ${visit.status} visit.`);
    }

    await db.collection('visits').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'cancelled',
          updatedAt: new Date().toISOString(),
        },
      }
    );

    sendSuccess(res, { message: 'Visit cancelled successfully.' });
  } catch (error: any) {
    console.error('Cancel visit error:', error);
    sendError(res, 500, 'Failed to cancel visit.');
  }
}

module.exports = { scheduleVisit, getMyVisits, getReceivedVisits, updateVisitStatus, cancelMyVisit };