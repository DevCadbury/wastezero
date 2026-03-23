const express = require('express');
const router = express.Router();
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const PointTransaction = require('../models/PointTransaction');
const { protect, volunteerOrAdmin } = require('../middleware/auth');
const { emitToRoom, emitToUser } = require('../socket');
const { createNotification } = require('../controllers/notificationController');

const ILLEGAL_DUMP_USER_POINTS = 20;
const ILLEGAL_DUMP_VOLUNTEER_POINTS = 30;

// POST /api/pickups - Create a pickup request (user only)
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ message: 'Only users can create pickup requests' });
    }
    const {
      title,
      wasteType,
      description,
      estimatedQuantity,
      address,
      preferredDate,
      preferredTime,
      contactDetails,
      mediaUrl,
      reportImages,
      requestType,
    } = req.body;

    const reqType = requestType === 'IllegalDump' ? 'IllegalDump' : 'Pickup';
    if (!title || !wasteType || !estimatedQuantity || !address || !preferredDate || !preferredTime) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }

    const images = Array.isArray(reportImages)
      ? reportImages.filter((url) => typeof url === 'string' && url.trim())
      : [];

    if (reqType === 'IllegalDump' && images.length === 0 && !mediaUrl) {
      return res.status(400).json({ message: 'At least one evidence image is required for illegal dump reports' });
    }

    const initialApprovalStatus = 'not-required';

    const pickup = await Pickup.create({
      title,
      user_id: req.user._id,
      requestType: reqType,
      wasteType,
      description: description || '',
      estimatedQuantity,
      address,
      preferredDate,
      preferredTime,
      contactDetails: contactDetails || '',
      mediaUrl: mediaUrl || null,
      reportImages: images.length ? images : (mediaUrl ? [mediaUrl] : []),
      adminApprovalStatus: initialApprovalStatus,
      status: 'Open',
    });

    const action = reqType === 'IllegalDump' ? 'ILLEGAL_DUMP_REPORTED' : 'PICKUP_CREATED';
    await AdminLog.create({
      action,
      user_id: req.user._id,
      pickup_id: pickup._id,
      details: `${reqType === 'IllegalDump' ? 'Illegal dump report' : 'Pickup'} "${title}" created by ${req.user.name}`,
    });

    const populated = await Pickup.findById(pickup._id).populate('user_id', 'name email username phone');

    // Realtime inform volunteers/admins about new request.
    emitToRoom('role:volunteer', 'pickup:created', populated.toObject());
    if (reqType === 'IllegalDump') {
      emitToRoom('role:admin', 'illegal-dump:reported', {
        pickupId: pickup._id,
        title: pickup.title,
        address: pickup.address,
      });
    }

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// GET /api/pickups/my - Get current user's pickups (user)
router.get('/my', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    let query;
    if (req.user.role === 'user') {
      query = Pickup.find({ user_id: req.user._id })
        .populate('volunteer_id', 'name email username phone')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    } else if (req.user.role === 'volunteer') {
      query = Pickup.find({ volunteer_id: req.user._id })
        .populate('user_id', 'name email username phone')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    } else {
      query = Pickup.find()
        .populate('user_id', 'name email username')
        .populate('volunteer_id', 'name email username')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    }
    const pickups = await query;
    res.json(pickups);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pickups/opportunities - All Open pickups for volunteers (paginated)
router.get('/opportunities', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const [pickups, total] = await Promise.all([
      Pickup.find({ status: 'Open' })
        .populate('user_id', 'name email username phone location')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Pickup.countDocuments({ status: 'Open' }),
    ]);
    res.json({ pickups, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pickups/all - Admin: get all pickups (paginated)
router.get('/all', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const [pickups, total] = await Promise.all([
      Pickup.find()
        .populate('user_id', 'name email username')
        .populate('volunteer_id', 'name email username')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Pickup.countDocuments(),
    ]);
    res.json({ pickups, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pickups/:id - Get single pickup
router.get('/:id', protect, async (req, res) => {
  try {
    const pickup = await Pickup.findById(req.params.id)
      .populate('user_id', 'name email username phone location')
      .populate('volunteer_id', 'name email username phone');
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    res.json(pickup);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/pickups/:id/accept - Volunteer accepts pickup
router.put('/:id/accept', protect, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({ message: 'Only volunteers can accept pickups' });
    }
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    if (pickup.status !== 'Open') return res.status(400).json({ message: 'Pickup is no longer available' });

    pickup.status = 'Accepted';
    pickup.volunteer_id = req.user._id;
    if (pickup.requestType === 'IllegalDump') {
      pickup.adminApprovalStatus = 'pending';
    }
    await pickup.save();

    await AdminLog.create({
      action: 'PICKUP_ACCEPTED',
      user_id: req.user._id,
      pickup_id: pickup._id,
      details: `Pickup "${pickup.title}" accepted by ${req.user.name}`,
    });

    const updated = await Pickup.findById(pickup._id)
      .populate('user_id', 'name email username phone')
      .populate('volunteer_id', 'name email username phone');

    try {
      await createNotification({
        user_id: pickup.user_id,
        type: 'pickup:accepted',
        title: pickup.requestType === 'IllegalDump' ? 'Illegal Dump Report Accepted' : 'Pickup Accepted',
        message: `${req.user.name} accepted your ${pickup.requestType === 'IllegalDump' ? 'illegal dump report' : 'pickup request'}`,
        ref_id: pickup._id,
        ref_model: 'Pickup',
      });
    } catch (e) {
      console.error('pickup accept notification error:', e.message);
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/pickups/:id/complete - Volunteer marks as completed
router.put('/:id/complete', protect, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only volunteers can complete pickups' });
    }
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    if (pickup.status !== 'Accepted') return res.status(400).json({ message: 'Pickup must be accepted first' });

    if (
      req.user.role === 'volunteer' &&
      pickup.volunteer_id &&
      pickup.volunteer_id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'You can only complete pickups assigned to you' });
    }

    const completionProofImages = Array.isArray(req.body?.completionProofImages)
      ? req.body.completionProofImages.filter((url) => typeof url === 'string' && url.trim())
      : [];

    if (pickup.requestType === 'IllegalDump' && completionProofImages.length === 0) {
      return res.status(400).json({ message: 'Completion proof images are required for illegal dump reports' });
    }

    pickup.status = 'Completed';
    pickup.completedAt = new Date();
    if (pickup.requestType === 'IllegalDump') {
      pickup.completionProofImages = completionProofImages;
    }

    if (pickup.requestType === 'IllegalDump') {
      pickup.adminApprovalStatus = 'pending';
    }

    await pickup.save();

    if (pickup.requestType !== 'IllegalDump') {
      // Update volunteer stats
      if (pickup.volunteer_id) {
        await User.findByIdAndUpdate(pickup.volunteer_id, { $inc: { totalPickupsCompleted: 1 } });
      }

      // Update user waste stats
      const wasteTypeMap = {
        Plastic: 'plastic', Organic: 'organic', 'E-Waste': 'eWaste',
        Metal: 'metal', Paper: 'paper', Glass: 'glass', Other: 'other'
      };
      const statKey = wasteTypeMap[pickup.wasteType] || 'other';
      const updateKey = `wasteStats.${statKey}`;
      await User.findByIdAndUpdate(pickup.user_id, { $inc: { [updateKey]: 1 } });
    }

    await AdminLog.create({
      action: 'PICKUP_COMPLETED',
      user_id: req.user._id,
      pickup_id: pickup._id,
      details: `Pickup "${pickup.title}" marked completed`,
    });

    const updated = await Pickup.findById(pickup._id)
      .populate('user_id', 'name email username phone')
      .populate('volunteer_id', 'name email username phone');

    try {
      if (pickup.requestType === 'IllegalDump') {
        emitToRoom('role:admin', 'illegal-dump:awaiting-approval', {
          pickupId: pickup._id,
          title: pickup.title,
          completedAt: pickup.completedAt,
        });

        await createNotification({
          user_id: pickup.user_id,
          type: 'system',
          title: 'Illegal Dump Cleanup Completed',
          message: 'A volunteer marked your illegal dump report as completed. Awaiting admin approval.',
          ref_id: pickup._id,
          ref_model: 'Pickup',
        });
      } else {
        await createNotification({
          user_id: pickup.user_id,
          type: 'pickup:completed',
          title: 'Pickup Completed',
          message: 'Your pickup request has been marked completed',
          ref_id: pickup._id,
          ref_model: 'Pickup',
        });
      }
    } catch (e) {
      console.error('pickup complete notification error:', e.message);
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/pickups/:id/approve-completion - Admin approves illegal dump completion
router.put('/:id/approve-completion', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    if (pickup.requestType !== 'IllegalDump') {
      return res.status(400).json({ message: 'Admin completion approval is only for illegal dump reports' });
    }
    if (pickup.status !== 'Completed') {
      return res.status(400).json({ message: 'Pickup must be completed before admin approval' });
    }
    if (pickup.adminApprovalStatus === 'approved') {
      return res.status(400).json({ message: 'Completion already approved' });
    }

    pickup.adminApprovalStatus = 'approved';
    pickup.approvedBy = req.user._id;
    pickup.approvedAt = new Date();

    if (!pickup.pointsAwarded) {
      const updatedReporter = await User.findByIdAndUpdate(pickup.user_id, {
        $inc: {
          rewardPoints: ILLEGAL_DUMP_USER_POINTS,
          totalPointsEarned: ILLEGAL_DUMP_USER_POINTS,
        },
      }, { new: true }).select('rewardPoints');

      await PointTransaction.create({
        user_id: pickup.user_id,
        points: ILLEGAL_DUMP_USER_POINTS,
        reason: 'Illegal dump report approved',
        source: 'illegal-dump',
        pickup_id: pickup._id,
        performedBy: req.user._id,
        balanceAfter: updatedReporter?.rewardPoints ?? null,
      });

      if (pickup.volunteer_id) {
        const updatedVolunteer = await User.findByIdAndUpdate(pickup.volunteer_id, {
          $inc: {
            rewardPoints: ILLEGAL_DUMP_VOLUNTEER_POINTS,
            totalPointsEarned: ILLEGAL_DUMP_VOLUNTEER_POINTS,
            totalPickupsCompleted: 1,
          },
        }, { new: true }).select('rewardPoints');

        await PointTransaction.create({
          user_id: pickup.volunteer_id,
          points: ILLEGAL_DUMP_VOLUNTEER_POINTS,
          reason: 'Illegal dump cleanup approved',
          source: 'illegal-dump',
          pickup_id: pickup._id,
          performedBy: req.user._id,
          balanceAfter: updatedVolunteer?.rewardPoints ?? null,
        });
      }

      pickup.pointsAwarded = true;
    }

    await pickup.save();

    await AdminLog.create({
      action: 'ILLEGAL_DUMP_APPROVED',
      user_id: req.user._id,
      pickup_id: pickup._id,
      details: `Illegal dump report "${pickup.title}" approved and points awarded`,
    });

    try {
      await createNotification({
        user_id: pickup.user_id,
        type: 'system',
        title: 'Report Approved - Points Earned',
        message: `Your illegal dump report was approved. You earned ${ILLEGAL_DUMP_USER_POINTS} points.`,
        ref_id: pickup._id,
        ref_model: 'Pickup',
      });

      if (pickup.volunteer_id) {
        await createNotification({
          user_id: pickup.volunteer_id,
          type: 'system',
          title: 'Cleanup Approved - Points Earned',
          message: `Admin approved your cleanup. You earned ${ILLEGAL_DUMP_VOLUNTEER_POINTS} points.`,
          ref_id: pickup._id,
          ref_model: 'Pickup',
        });

        emitToUser(pickup.volunteer_id, 'points:updated', {
          pickupId: pickup._id,
          points: ILLEGAL_DUMP_VOLUNTEER_POINTS,
        });
      }

      emitToUser(pickup.user_id, 'points:updated', {
        pickupId: pickup._id,
        points: ILLEGAL_DUMP_USER_POINTS,
      });
    } catch (e) {
      console.error('approve completion notification error:', e.message);
    }

    const updated = await Pickup.findById(pickup._id)
      .populate('user_id', 'name email username phone rewardPoints totalPointsEarned')
      .populate('volunteer_id', 'name email username phone rewardPoints totalPointsEarned')
      .populate('approvedBy', 'name username');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/pickups/:id/cancel - Cancel a pickup (user or admin)
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });

    if (req.user.role === 'user' && pickup.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (req.user.role === 'volunteer') return res.status(403).json({ message: 'Volunteers cannot cancel pickups' });

    pickup.status = 'Cancelled';
    await pickup.save();
    await AdminLog.create({ action: 'PICKUP_CANCELLED', user_id: req.user._id, details: `Pickup "${pickup.title}" cancelled` });
    res.json({ message: 'Pickup cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/pickups/:id - Admin deletes pickup
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const pickup = await Pickup.findByIdAndDelete(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    await AdminLog.create({ action: 'PICKUP_DELETED', user_id: req.user._id, details: `Pickup "${pickup.title}" deleted by admin` });
    res.json({ message: 'Pickup deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
