function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailLayout({ title, greeting, intro, lines = [], actionLabel, actionUrl, footer }) {
  const safeTitle = escapeHtml(title || 'WasteZero Update');
  const safeGreeting = escapeHtml(greeting || 'Hello,');
  const safeIntro = escapeHtml(intro || 'We have an update for you.');
  const safeFooter = escapeHtml(footer || 'You are receiving this email because your account is active in WasteZero.');

  const htmlLines = (lines || [])
    .filter(Boolean)
    .map((line) => `<li style=\"margin-bottom:8px;\">${escapeHtml(line)}</li>`)
    .join('');

  const actionBlock = actionLabel && actionUrl
    ? `<a href=\"${escapeHtml(actionUrl)}\" style=\"display:inline-block;margin-top:12px;padding:10px 14px;border-radius:8px;background:#166534;color:#fff;text-decoration:none;font-weight:600;\">${escapeHtml(actionLabel)}</a>`
    : '';

  const html = `
  <div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;color:#1f2937;\">
    <h2 style=\"margin:0 0 10px;font-size:20px;color:#0f172a;\">${safeTitle}</h2>
    <p style=\"margin:0 0 10px;\">${safeGreeting}</p>
    <p style=\"margin:0 0 12px;\">${safeIntro}</p>
    ${htmlLines ? `<ul style=\"padding-left:20px;margin:0 0 10px;\">${htmlLines}</ul>` : ''}
    ${actionBlock}
    <p style=\"margin:16px 0 0;font-size:12px;color:#64748b;\">${safeFooter}</p>
  </div>`;

  const textParts = [title, greeting, intro]
    .concat((lines || []).map((line) => `- ${line}`))
    .concat(actionLabel && actionUrl ? [`${actionLabel}: ${actionUrl}`] : [])
    .concat([footer || '']);

  const text = textParts.filter(Boolean).join('\n');

  return { html, text };
}

module.exports = {
  buildEmailLayout,
};
