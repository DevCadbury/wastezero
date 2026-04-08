const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }
      if (req.user.isSuspended) {
        return res.status(403).json({ message: 'Account suspended. Contact admin.' });
      }

      // Keep lastSeen fresh for chat presence without blocking request flow.
      const now = Date.now();
      const lastSeenTs = req.user.lastSeen ? new Date(req.user.lastSeen).getTime() : 0;
      if (now - lastSeenTs > 60 * 1000) {
        User.updateOne({ _id: req.user._id }, { $set: { lastSeen: new Date(now) } }).catch(() => {});
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};

const volunteerOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'volunteer' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Volunteer or Admin access required' });
  }
};

const volunteerOnly = (req, res, next) => {
  if (req.user && req.user.role === 'volunteer') {
    next();
  } else {
    res.status(403).json({ error: true, message: 'Volunteer access required' });
  }
};

module.exports = { protect, adminOnly, volunteerOnly, volunteerOrAdmin };
