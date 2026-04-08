const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const ctrl = require('../controllers/opportunityController');

// All routes require authentication
router.use(protect);

// POST   /api/opportunities          — Admin creates opportunity
router.post('/', adminOnly, ctrl.createOpportunity);

// GET    /api/opportunities          — List opportunities (role-aware)
router.get('/', ctrl.listOpportunities);

// GET    /api/opportunities/matches  — Volunteer profile-based suggestions
router.get('/matches', ctrl.listMatchedOpportunities);

// GET    /api/opportunities/:id      — Get single opportunity
router.get('/:id', ctrl.getOpportunity);

// PUT    /api/opportunities/:id      — Admin updates opportunity
router.put('/:id', adminOnly, ctrl.updateOpportunity);

// DELETE /api/opportunities/:id      — Admin soft-deletes opportunity
router.delete('/:id', adminOnly, ctrl.deleteOpportunity);

module.exports = router;
