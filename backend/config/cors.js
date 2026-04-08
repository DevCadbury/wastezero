function parseCsv(value) {
  return (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const base = ['http://localhost:4200', 'http://localhost:3000'];
  const fromFrontendUrl = parseCsv(process.env.FRONTEND_URL);
  const fromCorsOrigins = parseCsv(process.env.CORS_ORIGINS);
  return Array.from(new Set([...base, ...fromFrontendUrl, ...fromCorsOrigins]));
}

function corsOriginHandler(origin, callback) {
  const allowedOrigins = getAllowedOrigins();

  // Allow non-browser clients (no Origin header) and same-origin server calls.
  if (!origin) return callback(null, true);

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error('CORS origin not allowed'));
}

module.exports = {
  getAllowedOrigins,
  corsOriginHandler,
};
