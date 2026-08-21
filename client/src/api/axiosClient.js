import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Kept in memory, not localStorage, so XSS cannot read it.
let accessToken = null;
let onAuthFailure = () => {};

export const setAccessToken = (token) => { accessToken = token; };
export const getAccessToken = () => accessToken;

export const registerAuthFailureHandler = (handler) => { onAuthFailure = handler; };

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Single-flight: parallel 401s must share one refresh, or rotation revokes the family.
let refreshPromise = null;

async function performRefresh() {
  const response = await axios.post(`${baseURL}/auth/refresh`, null, { withCredentials: true });
  setAccessToken(response.data.accessToken);
  return response.data;
}

export function refreshSession() {
  refreshPromise = refreshPromise ?? performRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    const isRefreshCall = original?.url?.includes('/auth/refresh');
    const isLoginCall = original?.url?.includes('/auth/login');

    if (status !== 401 || isRefreshCall || isLoginCall || original?._retried) {
      return Promise.reject(normalise(error));
    }

    if (code === 'ACCOUNT_DEACTIVATED') {
      onAuthFailure('Your account has been deactivated.');
      return Promise.reject(normalise(error));
    }

    original._retried = true;

    try {
      await refreshSession();

      return api(original);
    } catch (refreshError) {
      setAccessToken(null);
      onAuthFailure('Your session has expired. Please sign in again.');
      return Promise.reject(normalise(refreshError));
    }
  },
);

export function normalise(error) {
  if (error && typeof error === 'object' && !(error instanceof Error) && !error.isAxiosError && 'code' in error) {
    return error;
  }

  const payload = error?.response?.data?.error;
  if (payload) {
    return {
      code: payload.code,
      message: payload.message,
      details: payload.details ?? null,
      status: error.response.status,
    };
  }
  if (error?.request) {
    return { code: 'NETWORK_ERROR', message: 'Could not reach the server. Is the API running?', status: 0 };
  }
  return { code: 'UNKNOWN', message: error?.message ?? 'Unexpected error', status: 0 };
}

export const toRejection = normalise;
