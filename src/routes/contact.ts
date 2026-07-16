export {};

const { Router } = require('express');
const { submitContact } = require('../controllers/contactController');

const router = Router();

// POST /api/contact — Submit contact form
router.post('/', submitContact);

module.exports = router;