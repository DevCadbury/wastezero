const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const { protect } = require('../middleware/auth');
const { emitToUser } = require('../socket');
const { createNotification } = require('../controllers/notificationController');
const { upload } = require('../middleware/upload');

const LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

function idStr(id) {
  return id ? id.toString() : '';
}

function isPickupLocked(pickup) {
  if (!pickup || pickup.status !== 'Completed' || !pickup.completedAt) return false;
  return Date.now() - new Date(pickup.completedAt).getTime() >= LOCK_WINDOW_MS;
}

async function getAcceptedOrCompletedPickup(userId, volunteerId) {
  return Pickup.findOne({
    user_id: userId,
    volunteer_id: volunteerId,
    status: { $in: ['Accepted', 'Completed'] },
  })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .lean();
}

async function getAllowedPartnerIds(user) {
  if (user.role === 'admin') return null;

  if (user.role === 'volunteer') {
    const [admins, linkedUsers] = await Promise.all([
      User.find({ role: 'admin', isSuspended: { $ne: true } }).select('_id').lean(),
      Pickup.find({
        volunteer_id: user._id,
        status: { $in: ['Accepted', 'Completed'] },
      }).select('user_id').lean(),
    ]);

    const ids = new Set(admins.map((a) => idStr(a._id)));
    linkedUsers.forEach((p) => ids.add(idStr(p.user_id)));
    return ids;
  }

  if (user.role === 'user') {
    const linkedVolunteers = await Pickup.find({
      user_id: user._id,
      volunteer_id: { $ne: null },
      status: { $in: ['Accepted', 'Completed'] },
    }).select('volunteer_id').lean();

    const ids = new Set();
    linkedVolunteers.forEach((p) => ids.add(idStr(p.volunteer_id)));
    return ids;
  }

  return new Set();
}

async function resolvePairRules(sender, receiverId) {
  const receiver = await User.findById(receiverId).select('name username role email isSuspended').lean();
  if (!receiver) return { ok: false, status: 404, message: 'Receiver not found' };
  if (receiver.isSuspended) return { ok: false, status: 403, message: 'Receiver account is suspended' };

  if (sender.role === 'admin') {
    return { ok: true, receiver, pickup: null, locked: false };
  }

  if (sender.role === 'volunteer') {
    if (receiver.role === 'admin') {
      return { ok: true, receiver, pickup: null, locked: false };
    }
    if (receiver.role !== 'user') {
      return { ok: false, status: 403, message: 'Volunteers can message admins and linked users only' };
    }

    const pickup = await getAcceptedOrCompletedPickup(receiver._id, sender._id);
    if (!pickup) {
      return { ok: false, status: 403, message: 'Messaging allowed only for users with accepted pickups' };
    }
    const locked = isPickupLocked(pickup);
    return { ok: true, receiver, pickup, locked };
  }

  if (sender.role === 'user') {
    if (receiver.role !== 'volunteer') {
      return { ok: false, status: 403, message: 'Users can message only volunteers who accepted their pickup' };
    }

    const pickup = await getAcceptedOrCompletedPickup(sender._id, receiver._id);
    if (!pickup) {
      return { ok: false, status: 403, message: 'No accepted pickup found with this volunteer' };
    }
    const locked = isPickupLocked(pickup);
    return { ok: true, receiver, pickup, locked };
  }

  return { ok: false, status: 403, message: 'Unsupported role for messaging' };
}

async function getConversationLock(myId, partnerId) {
  const pickup = await Pickup.findOne({
    $or: [
      { user_id: myId, volunteer_id: partnerId },
      { user_id: partnerId, volunteer_id: myId },
    ],
    status: { $in: ['Accepted', 'Completed'] },
  })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .select('_id status completedAt user_id volunteer_id')
    .lean();

  const locked = isPickupLocked(pickup);
  return {
    locked,
    pickup_id: pickup?._id || null,
    lockAt: pickup?.completedAt
      ? new Date(new Date(pickup.completedAt).getTime() + LOCK_WINDOW_MS).toISOString()
      : null,
    status: pickup?.status || null,
  };
}

// POST /api/messages - Send a message (with optional media)
router.post('/', protect, (req, res, next) => { req.uploadFolder = 'messages'; next(); }, upload.single('media'), async (req, res) => {
  try {
    const { receiver_id, content, pickup_id } = req.body;
    if (!receiver_id || (!content && !req.file)) {
      return res.status(400).json({ message: 'Receiver and content or media are required' });
    }

    const rules = await resolvePairRules(req.user, receiver_id);
    if (!rules.ok) return res.status(rules.status).json({ message: rules.message });
    if (rules.locked) {
      return res.status(403).json({
        message: 'This conversation is archived 24 hours after pickup completion and is now locked',
        locked: true,
        pickup_id: rules.pickup?._id || null,
      });
    }

    let mediaType = null;
    if (req.file) {
      const mt = req.file.mimetype || '';
      if (mt.startsWith('image/')) mediaType = 'image';
      else if (mt.startsWith('video/')) mediaType = 'video';
      else mediaType = 'file';
    }

    // Keep messages tied to the pickup conversation for lock/audit checks.
    const resolvedPickupId = pickup_id || rules.pickup?._id || null;

    const message = await Message.create({
      sender_id: req.user._id,
      receiver_id,
      content: content || '',
      mediaUrl: req.file?.path || null,
      mediaType,
      pickup_id: resolvedPickupId,
    });
    const populated = await Message.findById(message._id)
      .populate('sender_id', 'name username role')
      .populate('receiver_id', 'name username role');

    // ── Real-time: emit message to recipient ──
    try {
      emitToUser(receiver_id, 'chat:message', populated.toObject());
      const preview = content ? `${req.user.name}: ${content.slice(0, 80)}` : `${req.user.name} sent a file`;
      await createNotification({
        user_id: receiver_id,
        type: 'chat:message',
        title: 'New Message',
        message: preview,
        ref_id: message._id,
        ref_model: 'Message',
      });
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/search-users?q=  — find users to start a conversation
router.get('/search-users', protect, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const regex = new RegExp(q, 'i');

    const allowedIds = await getAllowedPartnerIds(req.user);
    const query = {
      _id: { $ne: req.user._id },
      isSuspended: { $ne: true },
      $or: [{ name: regex }, { username: regex }, { email: regex }],
    };

    if (allowedIds) {
      query._id = { $in: Array.from(allowedIds) };
    }

    const users = await User.find(query).select('name username role email').limit(15).lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/allowed-contacts  — list contactable users by role rules
router.get('/allowed-contacts', protect, async (req, res) => {
  try {
    const allowedIds = await getAllowedPartnerIds(req.user);
    const query = {
      _id: { $ne: req.user._id },
      isSuspended: { $ne: true },
    };

    if (allowedIds) {
      query._id = { $in: Array.from(allowedIds) };
    }

    const users = await User.find(query)
      .select('name username role email')
      .sort({ role: 1, name: 1 })
      .lean();

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/conversations - Get all conversation partners (aggregation, not full scan)
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const allowedIds = await getAllowedPartnerIds(req.user);

    // Single aggregation query replaces loading ALL messages into memory
    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender_id: userId }, { receiver_id: userId }] } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$sender_id', userId] }, '$receiver_id', '$sender_id'],
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiver_id', userId] }, { $eq: ['$isRead', false] }] },
                1, 0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.timestamp': -1 } },
      { $limit: 50 },
    ]);

    const partnerIds = conversations.map((c) => c._id);
    const partners = await User.find({ _id: { $in: partnerIds } }).select('name username role').lean();
    const partnerMap = {};
    partners.forEach((p) => { partnerMap[p._id.toString()] = p; });

    const filtered = conversations.filter((c) => {
      const pid = idStr(c._id);
      if (!partnerMap[pid]) return false;
      if (!allowedIds) return true;
      return allowedIds.has(pid);
    });

    const result = await Promise.all(filtered.map(async (c) => {
      const lockMeta = await getConversationLock(userId, c._id);
      return {
        partner: partnerMap[c._id.toString()],
        lastMessage: c.lastMessage,
        unreadCount: c.unreadCount,
        ...lockMeta,
      };
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/archived  — admin: archived pickup conversations
router.get('/archived', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const before = new Date(Date.now() - LOCK_WINDOW_MS);

    const filter = {
      status: 'Completed',
      completedAt: { $lte: before },
    };

    if (req.query.pickup_id) {
      filter._id = req.query.pickup_id;
    }

    const [pickups, total] = await Promise.all([
      Pickup.find(filter)
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id title user_id volunteer_id completedAt status')
        .populate('user_id', 'name username')
        .populate('volunteer_id', 'name username')
        .lean(),
      Pickup.countDocuments(filter),
    ]);

    const pickupIds = pickups.map((p) => p._id);
    const messages = await Message.find({ pickup_id: { $in: pickupIds } })
      .sort({ timestamp: 1 })
      .populate('sender_id', 'name username role')
      .populate('receiver_id', 'name username role')
      .lean();

    const grouped = {};
    messages.forEach((m) => {
      const key = idStr(m.pickup_id);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });

    const items = pickups.map((p) => ({
      pickup: p,
      messages: grouped[idStr(p._id)] || [],
      locked: true,
    }));

    res.json({
      items,
      page,
      pages: Math.ceil(total / limit) || 1,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/:userId - Get messages with another user (parallel fetch + mark-read)
router.get('/:userId', protect, async (req, res) => {
  try {
    const myId = req.user._id;
    const otherId = req.params.userId;
    const limit = Math.min(200, parseInt(req.query.limit) || 100);

    const rules = await resolvePairRules(req.user, otherId);
    if (!rules.ok) return res.status(rules.status).json({ message: rules.message });

    // Fetch messages and mark-as-read in parallel
    const [messages] = await Promise.all([
      Message.find({
        $or: [
          { sender_id: myId, receiver_id: otherId },
          { sender_id: otherId, receiver_id: myId },
        ],
      })
        .populate('sender_id', 'name username role')
        .populate('receiver_id', 'name username role')
        .sort({ timestamp: 1 })
        .limit(limit)
        .lean(),
      Message.updateMany(
        { sender_id: otherId, receiver_id: myId, isRead: false },
        { isRead: true }
      ),
    ]);

    const lockMeta = await getConversationLock(myId, otherId);
    res.json({
      messages,
      ...lockMeta,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
