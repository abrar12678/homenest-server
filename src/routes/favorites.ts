export {};

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getFavorites, toggleFavorite, checkFavorite } = require('../controllers/favoriteController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', getFavorites);
router.get('/check/:propertyId', checkFavorite);
router.post('/:propertyId', toggleFavorite);

module.exports = router;