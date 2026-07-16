export {};

const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');
const { uploadImage } = require('../controllers/uploadController');

const router = Router();

// POST /api/upload/image — Upload image to ImgBB (Protected)
router.post('/image', authMiddleware, uploadImage);

module.exports = router;