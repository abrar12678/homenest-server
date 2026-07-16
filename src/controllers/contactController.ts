export {};

const { getDB } = require('../config/db');
const { isValidEmail, sendError, sendSuccess } = require('../utils/helpers');

/**
 * POST /api/contact
 * Submit a contact form message
 */
async function submitContact(req: any, res: any): Promise<void> {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return sendError(res, 400, 'Name is required.');
    }

    if (!email || !email.trim()) {
      return sendError(res, 400, 'Email is required.');
    }

    if (!isValidEmail(email)) {
      return sendError(res, 400, 'Please provide a valid email address.');
    }

    if (!subject || !subject.trim()) {
      return sendError(res, 400, 'Subject is required.');
    }

    if (!message || !message.trim()) {
      return sendError(res, 400, 'Message is required.');
    }

    const db = getDB();
    const collection = db.collection('contactMessages');

    const now = new Date().toISOString();
    const contactMessage = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      subject: subject.trim(),
      message: message.trim(),
      createdAt: now,
    };

    await collection.insertOne(contactMessage);

    sendSuccess(res, { message: 'Your message has been sent successfully. We will get back to you soon!' }, 201);
  } catch (error: any) {
    console.error('Contact form error:', error);
    sendError(res, 500, 'Server error while sending your message. Please try again.');
  }
}

module.exports = { submitContact };