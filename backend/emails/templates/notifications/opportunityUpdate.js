const { buildEmailLayout } = require('../layout');

function buildOpportunityUpdateTemplate({ userName, title, message }) {
  return buildEmailLayout({
    title: title || 'Opportunity Update',
    greeting: `Hi ${userName || 'there'},`,
    intro: message || 'There is an update about an opportunity or application.',
    lines: [
      'Open Opportunities or My Applications to review details.',
    ],
    footer: 'Opportunity email updates can be changed in profile settings.',
  });
}

module.exports = {
  buildOpportunityUpdateTemplate,
};
