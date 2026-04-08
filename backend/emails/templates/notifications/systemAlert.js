const { buildEmailLayout } = require('../layout');

function buildSystemAlertTemplate({ userName, title, message }) {
  return buildEmailLayout({
    title: title || 'WasteZero System Alert',
    greeting: `Hi ${userName || 'there'},`,
    intro: message || 'A new system alert was posted for your account.',
    lines: [
      'This alert is also available in your in-app notifications.',
    ],
    footer: 'You can disable popup alerts in the notification area at any time.',
  });
}

module.exports = {
  buildSystemAlertTemplate,
};
