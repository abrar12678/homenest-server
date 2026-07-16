export {};

const { Router } = require('express');
const { register, login, getMe, googleAuth, updateProfile } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// POST /api/auth/google — Google OAuth
router.post('/google', googleAuth);

// POST /api/auth/register — Register new user
router.post('/register', register);

// POST /api/auth/login — Login
router.post('/login', login);

// GET /api/auth/me — Get current user (Protected)
router.get('/me', authMiddleware, getMe);

// PUT /api/auth/profile — Update profile (Protected)
router.put('/profile', authMiddleware, updateProfile);

module.exports = router;