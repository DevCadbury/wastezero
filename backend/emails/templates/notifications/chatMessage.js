const { buildEmailLayout } = require('../layout');

function buildChatMessageTemplate({ userName, title, message }) {
  return buildEmailLayout({
    title: title || 'New Chat Message',
    greeting: `Hi ${userName || 'there'},`,
    intro: message || 'You have a new chat message in WasteZero.',
    lines: [
      'Open the Messages page to reply.',
    ],
    footer: 'Turn chat emails on or off from your profile email preferences.',
  });
}

module.exports = {
  buildChatMessageTemplate,
};
