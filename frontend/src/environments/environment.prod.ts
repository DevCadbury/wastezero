const runtimeConfig = (globalThis as any).__WZ_CONFIG__ || {};
const browserOrigin = (globalThis as any)?.location?.origin || '';
const backendUrl = runtimeConfig.BACKEND_URL || browserOrigin || 'http://localhost:5000';

export const environment = {
  production: true,
  backendUrl,
  apiUrl: runtimeConfig.API_URL || `${backendUrl}/api`,
  socketUrl: runtimeConfig.SOCKET_URL || backendUrl,
};
