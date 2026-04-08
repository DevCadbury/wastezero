const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const { createNotification } = require('./notificationController');
const { emitToUser } = require('../socket');

// POST /api/support  — create ticket
exports.createTicket = async (req, res) => {
  try {
    const { category, subject, description } = req.body;
    if (!category || !subject || !description) {
      return res.status(400).json({ message: 'category, subject and description are required' });
    }
    const mediaUrl = req.file?.path || null;
    const ticket = await SupportTicket.create({
      user_id: req.user._id,
      role: req.user.role,
      category,
      subject,
      description,
      mediaUrl,
    });
    // Notify all admins about the new ticket
    const admins = await User.find({ role: 'admin' }, '_id').lean();
    await Promise.all(admins.map(admin =>
      createNotification({
        user_id: admin._id,
        type: 'system',
        title: 'New Support Ticket',
        message: `${req.user.name} opened a ticket: "${subject}"`,
        ref_model: 'SupportTicket',
        ref_id: ticket._id,
      })
    ));
    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
};

// GET /api/support/my  — user's own tickets
exports.myTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user_id: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/support/:id  — single ticket
exports.getTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('user_id', 'name username role email avatar')
      .populate('replies.author_id', 'name username role avatar')
      .lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    // Non-admin can only view their own ticket
    if (req.user.role !== 'admin' && ticket.user_id._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/support  — admin: all tickets
exports.allTickets = async (req, res) => {
  try {
    const { status, category, page = 1, limit = 30, search = '', user = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const searchText = (search || '').toString().trim();
    const userText = (user || '').toString().trim();

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { reportId: regex },
        { subject: regex },
        { description: regex },
      ];
    }

    if (userText) {
      const userRegex = new RegExp(userText, 'i');
      const userFilter = [];
      if (userRegex) {
        userFilter.push({ name: userRegex }, { email: userRegex }, { username: userRegex });
      }
      if (userText.match(/^[0-9a-fA-F]{24}$/)) {
        userFilter.push({ _id: userText });
      }

      const matchedUsers = await User.find({ $or: userFilter }).select('_id').lean();
      const matchedIds = matchedUsers.map((u) => u._id);
      if (!matchedIds.length) {
        return res.json({ tickets: [], total: 0, page: pageNum, pages: 1, limit: limitNum });
      }
      filter.user_id = { $in: matchedIds };
    }

    const tickets = await SupportTicket.find(filter)
      .populate('user_id', 'name username role email avatar')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();
    const total = await SupportTicket.countDocuments(filter);
    res.json({
      tickets,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/support/:id/status  — admin: update status
exports.updateStatus = async (req, res) => {
  try {
    const { status, adminResponse } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (status) ticket.status = status;
    if (adminResponse !== undefined) ticket.adminResponse = adminResponse;
    await ticket.save();
    // Notify user about status change
    if (status) {
      await createNotification({
        user_id: ticket.user_id,
        type: 'system',
        title: 'Support Ticket Updated',
        message: `Your ticket "${ticket.subject}" status changed to ${status}`,
        ref_model: 'SupportTicket',
        ref_id: ticket._id,
      });
      emitToUser(ticket.user_id.toString(), 'ticket:updated', { ticketId: ticket._id, status });
    }
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/support/:id/reply  — add chat reply
exports.addReply = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'Content is required' });
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('user_id', '_id name');
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    // Non-admin can only reply to own ticket
    if (req.user.role !== 'admin' && ticket.user_id._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const mediaUrl = req.file?.path || null;
    ticket.replies.push({ author_id: req.user._id, authorRole: req.user.role, content, mediaUrl });
    // Auto-advance status when admin replies
    if (req.user.role === 'admin' && ticket.status === 'open') ticket.status = 'in-progress';
    await ticket.save();
    const reply = ticket.replies[ticket.replies.length - 1];
    // Notify: admin reply → notify user; user reply → notify all admins
    if (req.user.role === 'admin') {
      const notifyUser = ticket.user_id._id;
      await createNotification({
        user_id: notifyUser,
        type: 'system',
        title: 'New Reply on Your Ticket',
        message: `Admin replied to your ticket "${ticket.subject}"`,
        ref_model: 'SupportTicket',
        ref_id: ticket._id,
      });
      emitToUser(notifyUser.toString(), 'ticket:reply', { ticketId: ticket._id, reply });
    } else {
      const admins = await User.find({ role: 'admin' }, '_id').lean();
      await Promise.all(admins.map(admin =>
        createNotification({
          user_id: admin._id,
          type: 'system',
          title: 'New Reply on Ticket',
          message: `${req.user.name} replied to ticket "${ticket.subject}"`,
          ref_model: 'SupportTicket',
          ref_id: ticket._id,
        })
      ));
    }
    res.json(reply);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
};
