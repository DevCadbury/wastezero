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
  reportId: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
  role: { type: String, enum: ['user', 'volunteer', 'admin'], required: true },
  category: {
    type: String,
    enum: ['account', 'pickup', 'payment', 'bug', 'feature', 'chat-report', 'other'],
    required: true,
  },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  mediaUrl: { type: String, default: null },
  status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
  adminResponse: { type: String, default: '' },
  messageReport: {
    reportedMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    conversationSample: { type: String, default: '' },
  },
  replies: [replySchema],
}, { timestamps: true });

ticketSchema.index({ user_id: 1, createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });

ticketSchema.pre('validate', function(next) {
  if (!this.reportId) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).toUpperCase().slice(2, 8);
    this.reportId = `RPT-${stamp}-${random}`;
  }
  next();
});

module.exports = mongoose.model('SupportTicket', ticketSchema);
