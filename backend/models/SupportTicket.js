const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['user', 'volunteer', 'admin'] },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  mediaUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['user', 'volunteer', 'admin'], required: true },
  category: {
    type: String,
    enum: ['account', 'pickup', 'payment', 'bug', 'feature', 'other'],
    required: true,
  },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  mediaUrl: { type: String, default: null },
  status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
  adminResponse: { type: String, default: '' },
  replies: [replySchema],
}, { timestamps: true });

ticketSchema.index({ user_id: 1, createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', ticketSchema);
