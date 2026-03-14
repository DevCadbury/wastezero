const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Set upload folder from query param or body
const setFolder = (req, res, next) => {
  req.uploadFolder = req.query.folder || req.body.folder || 'general';
  next();
};

// POST /api/upload/single
router.post('/single', protect, setFolder, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.json({
    url: req.file.path,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

// POST /api/upload/multiple (max 5 files)
router.post('/multiple', protect, setFolder, upload.array('files', 5), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'No files uploaded' });
  res.json(req.files.map(f => ({ url: f.path, originalName: f.originalname, mimetype: f.mimetype, size: f.size })));
});

module.exports = router;
