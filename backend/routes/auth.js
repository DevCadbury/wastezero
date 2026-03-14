const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { protect } = require('../middleware/auth');

// Reusable mail transporter
function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password, role, skills, location, bio, phone } = req.body;

    if (!name || !email || !username || !password) {
      return res.status(400).json({ message: 'Please provide name, email, username and password' });
    }

    const emailExists = await User.findOne({ email });
    if (emailExists) return res.status(400).json({ message: 'Email already registered' });

    const usernameExists = await User.findOne({ username });
    if (usernameExists) return res.status(400).json({ message: 'Username already taken' });

    const allowedRoles = ['user', 'volunteer', 'admin'];
    const userRole = allowedRoles.includes(role) ? role : 'user';

    const user = await User.create({
      name,
      email,
      username,
      password,
      role: userRole,
      skills: skills || [],
      location: location || '',
      bio: bio || '',
      phone: phone || '',
    });

    await AdminLog.create({ action: 'USER_REGISTERED', user_id: user._id, details: `${user.name} registered as ${user.role}` });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Check suspension BEFORE bcrypt (bcrypt is slow ~100ms, no need to run it for suspended accounts)
    if (user.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact admin.' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    await AdminLog.create({ action: 'USER_LOGIN', user_id: user._id, details: `${user.name} logged in` });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      location: user.location,
      skills: user.skills,
      bio: user.bio,
      phone: user.phone,
      wasteStats: user.wasteStats,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always return 200 to prevent email enumeration
    if (!user) return res.json({ message: 'If that email is registered, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password?token=${token}`;
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"WasteZero" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'WasteZero — Password Reset Request',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f5f7fa;border-radius:12px;">
          <h2 style="color:#2e7d32;margin-bottom:8px;">WasteZero Password Reset</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin:16px 0;">Reset Password</a>
          <p style="font-size:0.85rem;color:#64748b;">If you didn't request this, you can safely ignore this email.</p>
        </div>`,
    });
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Failed to send email. Please try again.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
