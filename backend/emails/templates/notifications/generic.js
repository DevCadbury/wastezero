const { buildEmailLayout } = require('../layout');

function buildGenericNotificationTemplate({ userName, title, message }) {
  return buildEmailLayout({
    title: title || 'WasteZero Notification',
    greeting: `Hi ${userName || 'there'},`,
    intro: message || 'You have a new update in your WasteZero account.',
    footer: 'You can manage notification email preferences from your profile settings.',
  });
}

module.exports = {
  buildGenericNotificationTemplate,
};
