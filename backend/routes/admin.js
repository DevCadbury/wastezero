const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const AdminLog = require('../models/AdminLog');
const PointTransaction = require('../models/PointTransaction');
const { emitToUser } = require('../socket');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/admin/stats - Platform overview stats
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
    // Run all count queries in parallel instead of sequentially
    const [
      totalUsers,
      totalVolunteers,
      totalAdmins,
      totalPickups,
      completedPickups,
      pendingPickups,
      cancelledPickups,
      wasteByType,
      recentActivity,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'volunteer' }),
      User.countDocuments({ role: 'admin' }),
      Pickup.countDocuments(),
      Pickup.countDocuments({ status: 'Completed' }),
      Pickup.countDocuments({ status: { $in: ['Open', 'Accepted'] } }),
      Pickup.countDocuments({ status: 'Cancelled' }),
      Pickup.aggregate([
        { $match: { status: 'Completed' } },
        { $group: { _id: '$wasteType', count: { $sum: 1 } } },
      ]),
      AdminLog.find()
        .populate('user_id', 'name username role')
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
    ]);

    res.json({
      totalUsers, totalVolunteers, totalAdmins,
      totalPickups, completedPickups, pendingPickups, cancelledPickups,
      wasteByType, recentActivity,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/users - All users (paginated)
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments({ role: { $ne: 'admin' } }),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/all-users - All accounts including admins
router.get('/all-users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/suspend - Suspend/activate user
router.put('/users/:id/suspend', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isSuspended = !user.isSuspended;
    await user.save();
    const action = user.isSuspended ? 'USER_SUSPENDED' : 'USER_ACTIVATED';
    await AdminLog.create({ action, user_id: user._id, performedBy: req.user._id, details: `${user.name} ${user.isSuspended ? 'suspended' : 'activated'} by admin` });
    res.json({ message: `User ${user.isSuspended ? 'suspended' : 'activated'}`, user: { _id: user._id, isSuspended: user.isSuspended } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await AdminLog.create({ action: 'USER_DELETED', performedBy: req.user._id, details: `${user.name} deleted by admin` });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/users - User report data
router.get('/reports/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/pickups - Pickup report data
router.get('/reports/pickups', protect, adminOnly, async (req, res) => {
  try {
    const pickups = await Pickup.find()
      .populate('user_id', 'name email username')
      .populate('volunteer_id', 'name email username')
      .sort({ createdAt: -1 })
      .lean();
    res.json(pickups);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/illegal-dumps - Full illegal dump audit trail with proofs and points
router.get('/reports/illegal-dumps', protect, adminOnly, async (req, res) => {
  try {
    const dumps = await Pickup.find({ requestType: 'IllegalDump' })
      .populate('user_id', 'name email username')
      .populate('volunteer_id', 'name email username')
      .populate('approvedBy', 'name username')
      .sort({ createdAt: -1 })
      .lean();

    const pickupIds = dumps.map((d) => d._id);

    const [pickupLogs, pointTransactions] = await Promise.all([
      AdminLog.find({ pickup_id: { $in: pickupIds } })
        .populate('performedBy', 'name username role')
        .sort({ timestamp: 1 })
        .lean(),
      PointTransaction.find({ pickup_id: { $in: pickupIds } })
        .populate('user_id', 'name email username role')
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const logsByPickup = new Map();
    pickupLogs.forEach((log) => {
      const key = String(log.pickup_id);
      if (!logsByPickup.has(key)) logsByPickup.set(key, []);
      logsByPickup.get(key).push(log);
    });

    const pointsByPickup = new Map();
    pointTransactions.forEach((tx) => {
      const key = String(tx.pickup_id);
      if (!pointsByPickup.has(key)) pointsByPickup.set(key, []);
      pointsByPickup.get(key).push(tx);
    });

    const data = dumps.map((d) => ({
      ...d,
      auditLogs: logsByPickup.get(String(d._id)) || [],
      pointTransactions: pointsByPickup.get(String(d._id)) || [],
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/waste - Waste stats
router.get('/reports/waste', protect, adminOnly, async (req, res) => {
  try {
    const wasteByType = await Pickup.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: '$wasteType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const monthlyTrend = await Pickup.aggregate([
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]);
    res.json({ wasteByType, monthlyTrend });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/volunteers - Volunteer report (single aggregation, no N+1)
router.get('/reports/volunteers', protect, adminOnly, async (req, res) => {
  try {
    const [volunteers, pickupStats] = await Promise.all([
      User.find({ role: 'volunteer' }).select('-password').lean(),
      Pickup.aggregate([
        { $match: { volunteer_id: { $ne: null }, status: { $in: ['Accepted', 'Completed'] } } },
        { $group: {
          _id: { volunteer_id: '$volunteer_id', status: '$status' },
          count: { $sum: 1 },
        }},
      ]),
    ]);

    // Build a lookup map from aggregation result
    const statsMap = {};
    pickupStats.forEach(({ _id, count }) => {
      const vid = _id.volunteer_id.toString();
      if (!statsMap[vid]) statsMap[vid] = { accepted: 0, completed: 0 };
      if (_id.status === 'Accepted') statsMap[vid].accepted = count;
      if (_id.status === 'Completed') statsMap[vid].completed = count;
    });

    const volunteerStats = volunteers.map((v) => {
      const s = statsMap[v._id.toString()] || { accepted: 0, completed: 0 };
      return { ...v, acceptedPickups: s.accepted, completedPickups: s.completed };
    });

    res.json(volunteerStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/logs - Activity logs (paginated)
router.get('/logs', protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 100);
    const action = (req.query.action || '').toString().trim();
    const search = (req.query.search || '').toString().trim();
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const query = {};
    if (action) query.action = action;
    if (search) {
      query.$or = [
        { details: { $regex: search, $options: 'i' } },
      ];
    }
    if (from || to) {
      query.timestamp = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) query.timestamp.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          query.timestamp.$lte = d;
        }
      }
      if (!Object.keys(query.timestamp).length) delete query.timestamp;
    }

    const logs = await AdminLog.find(query)
      .populate('user_id', 'name username role')
      .populate('performedBy', 'name username')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/points/users - list users with points for admin correction UI
router.get('/points/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ['user', 'volunteer'] } })
      .select('name email role rewardPoints totalPointsEarned isSuspended')
      .sort({ rewardPoints: -1, createdAt: -1 })
      .lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/points/users/:id/history - points transactions for a specific user
router.get('/points/users/:id/history', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email role rewardPoints totalPointsEarned').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Admin accounts do not use points' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').toString().trim();
    const source = (req.query.source || '').toString().trim();
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const query = { user_id: user._id };
    if (search) {
      const or = [
        { reason: { $regex: search, $options: 'i' } },
      ];
      if (mongoose.Types.ObjectId.isValid(search)) {
        or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
      query.$or = or;
    }
    if (source) {
      query.source = source;
    }
    if (from || to) {
      query.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) query.createdAt.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          query.createdAt.$lte = d;
        }
      }
      if (!Object.keys(query.createdAt).length) delete query.createdAt;
    }

    const [items, total] = await Promise.all([
      PointTransaction.find(query)
        .populate('pickup_id', 'title requestType address')
        .populate('performedBy', 'name username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PointTransaction.countDocuments(query),
    ]);

    // Build balance-after map from full user ledger so each row can show current at that transaction.
    const allUserTx = await PointTransaction.find({ user_id: user._id })
      .select('_id points balanceAfter')
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const balanceAfterById = new Map();
    let cursor = Number(user.rewardPoints || 0);
    allUserTx.forEach((tx) => {
      const txId = String(tx._id);
      const storedBalance = Number.isFinite(tx.balanceAfter) ? tx.balanceAfter : null;
      const balanceAtThisTx = storedBalance ?? cursor;
      balanceAfterById.set(txId, balanceAtThisTx);
      cursor = balanceAtThisTx - Number(tx.points || 0);
    });

    const enrichedItems = items.map((tx) => ({
      ...tx,
      balanceAfter: balanceAfterById.has(String(tx._id))
        ? balanceAfterById.get(String(tx._id))
        : (Number.isFinite(tx.balanceAfter) ? tx.balanceAfter : null),
    }));

    res.json({
      user,
      items: enrichedItems,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/points/logs - recent points adjustment logs with pagination
router.get('/points/logs', protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').toString().trim();
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();
    const recentDays = Math.max(1, parseInt(req.query.recentDays, 10) || 30);

    const query = { action: 'POINTS_ADJUSTED' };

    if (from || to) {
      query.timestamp = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) query.timestamp.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          query.timestamp.$lte = d;
        }
      }
      if (!Object.keys(query.timestamp).length) delete query.timestamp;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - recentDays);
      query.timestamp = { $gte: d };
    }

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();

      const userIds = matchingUsers.map((u) => u._id);

      query.$or = [
        { details: { $regex: search, $options: 'i' } },
      ];
      if (userIds.length) {
        query.$or.push({ user_id: { $in: userIds } });
        query.$or.push({ performedBy: { $in: userIds } });
      }
    }

    const [items, total] = await Promise.all([
      AdminLog.find(query)
        .populate('user_id', 'name username role email')
        .populate('performedBy', 'name username email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminLog.countDocuments(query),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
      recentDaysApplied: from || to ? null : recentDays,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/points/users/:id/adjust - manual points correction
router.put('/points/users/:id/adjust', protect, adminOnly, async (req, res) => {
  try {
    const rawDelta = Number(req.body?.delta);
    const reason = (req.body?.reason || '').toString().trim();

    if (!Number.isFinite(rawDelta) || rawDelta === 0) {
      return res.status(400).json({ message: 'A non-zero numeric delta is required' });
    }
    if (!reason) {
      return res.status(400).json({ message: 'Reason is required for points adjustment' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts do not use points' });
    }

    let appliedDelta = Math.trunc(rawDelta);
    if (appliedDelta < 0 && (user.rewardPoints || 0) + appliedDelta < 0) {
      appliedDelta = -(user.rewardPoints || 0);
    }
    if (appliedDelta === 0) {
      return res.status(400).json({ message: 'User has no points left to deduct' });
    }

    const beforePoints = user.rewardPoints || 0;
    const beforeTotalEarned = user.totalPointsEarned || 0;

    user.rewardPoints = beforePoints + appliedDelta;
    if (appliedDelta > 0) {
      user.totalPointsEarned = beforeTotalEarned + appliedDelta;
    }
    await user.save();

    const tx = await PointTransaction.create({
      user_id: user._id,
      points: appliedDelta,
      reason: `Admin adjustment: ${reason}`,
      source: 'system',
      performedBy: req.user._id,
      balanceAfter: user.rewardPoints,
    });

    await AdminLog.create({
      action: 'POINTS_ADJUSTED',
      user_id: user._id,
      performedBy: req.user._id,
      details: `Adjusted ${user.name} points by ${appliedDelta}. Before=${beforePoints}, After=${user.rewardPoints}, TotalEarnedBefore=${beforeTotalEarned}, TotalEarnedAfter=${user.totalPointsEarned}. TxID=${tx._id}. Reason: ${reason}`,
    });

    emitToUser(user._id, 'points:updated', {
      points: user.rewardPoints,
      delta: appliedDelta,
      source: 'system',
      reason: `Admin adjustment: ${reason}`,
    });

    res.json({
      message: 'Points adjusted successfully',
      user: {
        _id: user._id,
        name: user.name,
        rewardPoints: user.rewardPoints,
        totalPointsEarned: user.totalPointsEarned,
      },
      appliedDelta,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
