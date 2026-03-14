const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const ctrl = require('../controllers/supportController');

const setFolder = (folder) => (req, res, next) => { req.uploadFolder = folder; next(); };

router.post('/', protect, setFolder('support'), upload.single('media'), ctrl.createTicket);
router.get('/my', protect, ctrl.myTickets);
router.get('/', protect, adminOnly, ctrl.allTickets);
router.get('/:id', protect, ctrl.getTicket);
router.put('/:id/status', protect, adminOnly, ctrl.updateStatus);
router.post('/:id/reply', protect, setFolder('support'), upload.single('media'), ctrl.addReply);

module.exports = router;
