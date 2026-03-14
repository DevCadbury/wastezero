const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const { protect, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const setFolder = (req, res, next) => { req.uploadFolder = 'banners'; next(); };

// GET /api/banners  — public: get active banners
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate('opportunity_id', 'title')
      .lean();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/banners/all  — admin: all banners
router.get('/all', protect, adminOnly, async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name')
      .populate('opportunity_id', 'title')
      .lean();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/banners  — admin: create banner
router.post('/', protect, adminOnly, setFolder, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Banner image is required' });
    const { title, subtitle, linkUrl, opportunity_id } = req.body;
    const banner = await Banner.create({
      title,
      subtitle: subtitle || '',
      imageUrl: req.file.path,
      linkUrl: linkUrl || '',
      opportunity_id: opportunity_id || null,
      createdBy: req.user._id,
    });
    res.status(201).json(banner);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// PUT /api/banners/:id/toggle  — admin: toggle active
router.put('/:id/toggle', protect, adminOnly, async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    banner.isActive = !banner.isActive;
    await banner.save();
    res.json(banner);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/banners/:id  — admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
