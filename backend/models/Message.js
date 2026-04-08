const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  pickup_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pickup',
    default: null,
  },
  content: {
    type: String,
    trim: true,
    default: '',
  },
  mediaUrl: { type: String, default: null },
  mediaType: { type: String, enum: ['image', 'video', 'file', null], default: null },
  reactions: [
    {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      emoji: {
        type: String,
        required: true,
        trim: true,
      },
      reactedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  editedAt: {
    type: Date,
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: false });

// Indexes for conversation queries
messageSchema.index({ sender_id: 1, receiver_id: 1, timestamp: -1 });  // message thread
messageSchema.index({ receiver_id: 1, isRead: 1 });                    // unread count
messageSchema.index({ sender_id: 1, timestamp: -1 });                  // aggregation
messageSchema.index({ receiver_id: 1, timestamp: -1 });                // aggregation

module.exports = mongoose.model('Message', messageSchema);
