const { buildEmailLayout } = require('./layout');

function buildPasswordResetTemplate({ name, resetUrl }) {
  return buildEmailLayout({
    title: 'Reset Your WasteZero Password',
    greeting: `Hi ${name || 'there'},`,
    intro: 'We received a password reset request for your WasteZero account.',
    lines: [
      'This reset link is valid for 1 hour.',
      'If you did not request this, you can ignore this email safely.',
    ],
    actionLabel: 'Reset Password',
    actionUrl: resetUrl,
    footer: 'For security, never share your password or reset links.',
  });
}

module.exports = {
  buildPasswordResetTemplate,
};
