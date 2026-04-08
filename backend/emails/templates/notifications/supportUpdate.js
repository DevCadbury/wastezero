const { buildEmailLayout } = require('../layout');

function buildSupportUpdateTemplate({ userName, title, message }) {
  return buildEmailLayout({
    title: title || 'Support Ticket Update',
    greeting: `Hi ${userName || 'there'},`,
    intro: message || 'Your support ticket has been updated.',
    lines: [
      'Open Help & Support in the app to review the latest update.',
    ],
    footer: 'You can customize support email notifications in profile settings.',
  });
}

module.exports = {
  buildSupportUpdateTemplate,
};
