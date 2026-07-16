export {};

const { Router } = require('express');
const {
  listProperties,
  getFeaturedProperties,
  getProperty,
  createProperty,
  updateProperty,
  getMyProperties,
  deleteProperty,
  getStats,
} = require('../controllers/propertyController');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// GET /api/properties/featured — Get featured properties (must be before /:id)
router.get('/featured', getFeaturedProperties);

// GET /api/properties/user/my — Get current user's properties (Protected, must be before /:id)
router.get('/user/my', authMiddleware, getMyProperties);

// GET /api/properties — List properties with filtering, sorting, pagination
router.get('/', listProperties);

// POST /api/properties — Create property (Protected)
router.post('/', authMiddleware, createProperty);

// PUT /api/properties/:id — Update property (Protected, owner only)
router.put('/:id', authMiddleware, updateProperty);

// DELETE /api/properties/:id — Delete property (Protected, owner only)
router.delete('/:id', authMiddleware, deleteProperty);

// GET /api/properties/:id — Get single property
router.get('/:id', getProperty);

// GET /api/stats — Get public stats
router.get('/stats/public', getStats);

module.exports = router;