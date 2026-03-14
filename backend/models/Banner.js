const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  subtitle: { type: String, default: '', trim: true, maxlength: 400 },
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, default: '' },
  opportunity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

bannerSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Banner', bannerSchema);
