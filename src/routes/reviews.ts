export {};

const { Router } = require('express');
const { getPropertyReviews, addReview, getMyReviewCount } = require('../controllers/reviewController');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// GET /api/reviews/:propertyId — Get reviews for a property
router.get('/:propertyId', getPropertyReviews);

// GET /api/reviews/my/count — Get current user's review count (Protected)
router.get('/my/count', authMiddleware, getMyReviewCount);

// POST /api/reviews — Add a review (Protected)
router.post('/', authMiddleware, addReview);

module.exports = router;