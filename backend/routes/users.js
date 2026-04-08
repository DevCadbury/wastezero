const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const PointTransaction = require('../models/PointTransaction');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/users/profile - Get own profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/profile - Update own profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, location, skills, bio, phone, avatar, emailPreferences } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) {
      const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailExists) return res.status(400).json({ message: 'Email already in use' });
      user.email = email;
    }
    if (location !== undefined) user.location = location;
    if (skills !== undefined) user.skills = skills;
    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar || null;
    if (emailPreferences && typeof emailPreferences === 'object') {
      user.emailPreferences = {
        ...user.emailPreferences,
        enabled: emailPreferences.enabled !== undefined ? !!emailPreferences.enabled : user.emailPreferences?.enabled,
        generalNotifications: emailPreferences.generalNotifications !== undefined ? !!emailPreferences.generalNotifications : user.emailPreferences?.generalNotifications,
        systemAlerts: emailPreferences.systemAlerts !== undefined ? !!emailPreferences.systemAlerts : user.emailPreferences?.systemAlerts,
        messages: emailPreferences.messages !== undefined ? !!emailPreferences.messages : user.emailPreferences?.messages,
        support: emailPreferences.support !== undefined ? !!emailPreferences.support : user.emailPreferences?.support,
        opportunities: emailPreferences.opportunities !== undefined ? !!emailPreferences.opportunities : user.emailPreferences?.opportunities,
        pickups: emailPreferences.pickups !== undefined ? !!emailPreferences.pickups : user.emailPreferences?.pickups,
        security: emailPreferences.security !== undefined ? !!emailPreferences.security : user.emailPreferences?.security,
      };
    }

    await user.save();
    const updated = await User.findById(user._id).select('-password');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// GET /api/users/skills-catalog - Distinct volunteer profile skills for admin opportunity forms
router.get('/skills-catalog', protect, adminOnly, async (req, res) => {
  try {
    const rows = await User.aggregate([
      { $match: { role: 'volunteer', isSuspended: { $ne: true } } },
      { $project: { skills: 1 } },
      { $unwind: '$skills' },
      {
        $project: {
          skill: {
            $trim: { input: { $toString: '$skills' } },
          },
        },
      },
      { $match: { skill: { $ne: '' } } },
      { $group: { _id: { $toLower: '$skill' }, skill: { $first: '$skill' } } },
      { $sort: { skill: 1 } },
    ]);

    res.json(rows.map((r) => r.skill));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/change-password
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new password are required' });
    }
    const user = await User.findById(req.user._id);
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/stats - Get own dashboard stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    if (role === 'user') {
      const total = await Pickup.countDocuments({ user_id: userId });
      const completed = await Pickup.countDocuments({ user_id: userId, status: 'Completed' });
      const pending = await Pickup.countDocuments({ user_id: userId, status: { $in: ['Open', 'Accepted'] } });
      const user = await User.findById(userId).select('wasteStats name');
      res.json({ total, completed, pending, wasteStats: user.wasteStats, name: user.name });
    } else if (role === 'volunteer') {
      const available = await Pickup.countDocuments({ status: 'Open' });
      const accepted = await Pickup.countDocuments({ volunteer_id: userId, status: 'Accepted' });
      const completed = await Pickup.countDocuments({ volunteer_id: userId, status: 'Completed' });
      const user = await User.findById(userId).select('name');
      res.json({ available, accepted, completed, name: user.name });
    } else {
      res.status(403).json({ message: 'Use admin stats endpoint' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/points/summary - Current points and lifetime totals
router.get('/points/summary', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('rewardPoints totalPointsEarned');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      rewardPoints: user.rewardPoints || 0,
      totalPointsEarned: user.totalPointsEarned || 0,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/points/history - Points ledger for current user
router.get('/points/history', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      PointTransaction.find({ user_id: req.user._id })
        .populate('pickup_id', 'title requestType address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PointTransaction.countDocuments({ user_id: req.user._id }),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/volunteers - List volunteers (admin use)
router.get('/volunteers', protect, async (req, res) => {
  try {
    const volunteers = await User.find({ role: 'volunteer' }).select('-password');
    res.json(volunteers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
