const { sendEmail } = require('./mailer');
const { buildGenericNotificationTemplate } = require('./templates/notifications/generic');
const { buildSystemAlertTemplate } = require('./templates/notifications/systemAlert');
const { buildChatMessageTemplate } = require('./templates/notifications/chatMessage');
const { buildSupportUpdateTemplate } = require('./templates/notifications/supportUpdate');
const { buildPickupUpdateTemplate } = require('./templates/notifications/pickupUpdate');
const { buildOpportunityUpdateTemplate } = require('./templates/notifications/opportunityUpdate');

function pickTemplate(notification, userName) {
  const payload = {
    userName,
    title: notification?.title,
    message: notification?.message,
  };

  if (notification?.type === 'system:alert') return buildSystemAlertTemplate(payload);
  if ((notification?.type || '').startsWith('chat')) return buildChatMessageTemplate(payload);
  if (notification?.ref_model === 'SupportTicket') return buildSupportUpdateTemplate(payload);
  if ((notification?.type || '').startsWith('pickup')) return buildPickupUpdateTemplate(payload);
  if ((notification?.type || '').startsWith('opportunity') || (notification?.type || '').startsWith('application')) {
    return buildOpportunityUpdateTemplate(payload);
  }

  return buildGenericNotificationTemplate(payload);
}

async function sendNotificationEmail({ to, userName, notification }) {
  const template = pickTemplate(notification, userName);
  return sendEmail({
    to,
    subject: notification?.title || 'WasteZero Notification',
    html: template.html,
    text: template.text,
  });
}

module.exports = {
  sendNotificationEmail,
};
