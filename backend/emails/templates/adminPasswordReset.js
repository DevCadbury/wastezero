const { buildEmailLayout } = require('./layout');

function buildAdminPasswordResetTemplate({ name, resetBy, temporaryPassword }) {
  return buildEmailLayout({
    title: 'Your WasteZero Password Was Reset',
    greeting: `Hi ${name || 'there'},`,
    intro: 'An administrator reset your account password.',
    lines: [
      `Reset by: ${resetBy || 'Admin'}`,
      `Temporary password: ${temporaryPassword}`,
      'Please log in and change this password immediately from your profile settings.',
    ],
    footer: 'If you did not expect this change, contact support immediately.',
  });
}

module.exports = {
  buildAdminPasswordResetTemplate,
};
