const nodemailer = require('nodemailer');

let transporterCache = null;

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = toBool(process.env.SMTP_SECURE, false);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
  const from = process.env.EMAIL_FROM || (user ? `WasteZero <${user}>` : 'WasteZero <no-reply@wastezero.local>');

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

function hasSmtpConfig(config) {
  return !!(config.host && config.port && config.user && config.pass);
}

function getTransporter() {
  if (transporterCache) return transporterCache;

  const config = getSmtpConfig();
  if (!hasSmtpConfig(config)) {
    return null;
  }

  transporterCache = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return transporterCache;
}

async function sendEmail({ to, subject, html, text }) {
  const config = getSmtpConfig();
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[mailer] SMTP not configured. Email skipped for:', to);
    return { skipped: true };
  }

  return transporter.sendMail({
    from: config.from,
    to,
    subject,
    html,
    text,
  });
}

module.exports = {
  getSmtpConfig,
  sendEmail,
};
