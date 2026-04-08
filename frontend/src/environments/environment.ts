const runtimeConfig = (globalThis as any).__WZ_CONFIG__ || {};
const backendUrl = runtimeConfig.BACKEND_URL || 'http://localhost:5000';

export const environment = {
  production: false,
  backendUrl,
  apiUrl: runtimeConfig.API_URL || `${backendUrl}/api`,
  socketUrl: runtimeConfig.SOCKET_URL || backendUrl,
};
