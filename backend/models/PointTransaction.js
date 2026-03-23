const mongoose = require('mongoose');

const pointTransactionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  points: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  source: {
    type: String,
    enum: ['illegal-dump', 'pickup', 'system'],
    default: 'system',
  },
  pickup_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pickup',
    default: null,
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  balanceAfter: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

pointTransactionSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('PointTransaction', pointTransactionSchema);
