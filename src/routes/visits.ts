export {};

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  scheduleVisit,
  getMyVisits,
  getReceivedVisits,
  updateVisitStatus,
  cancelMyVisit,
} = require('../controllers/visitController');

const router = express.Router();

router.use(authMiddleware);

router.post('/', scheduleVisit);
router.get('/my', getMyVisits);
router.get('/received', getReceivedVisits);
router.patch('/:id/status', updateVisitStatus);
router.delete('/:id', cancelMyVisit);

module.exports = router;