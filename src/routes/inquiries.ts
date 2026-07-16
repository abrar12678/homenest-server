export {};

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { createInquiry, getSentInquiries, getReceivedInquiries, replyToInquiry } = require('../controllers/inquiryController');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createInquiry);
router.get('/sent', getSentInquiries);
router.get('/received', getReceivedInquiries);
router.put('/:id/reply', replyToInquiry);

module.exports = router;