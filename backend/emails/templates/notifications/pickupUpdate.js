const { buildEmailLayout } = require('../layout');

function buildPickupUpdateTemplate({ userName, title, message }) {
  return buildEmailLayout({
    title: title || 'Pickup Update',
    greeting: `Hi ${userName || 'there'},`,
    intro: message || 'There is an update for one of your pickup requests.',
    lines: [
      'Check the pickup details page for current status and next steps.',
    ],
    footer: 'Pickup update emails can be managed from your profile settings.',
  });
}

module.exports = {
  buildPickupUpdateTemplate,
};
