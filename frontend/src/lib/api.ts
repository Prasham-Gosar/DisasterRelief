import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from './types';

const TOKEN_KEY = 'drrcp_token';

/** Typed API error thrown by every failed request */
export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Shared axios instance – baseURL is "" because all paths already start with /api */
const api = axios.create({ baseURL: '' });

// ── Request interceptor: attach Bearer token ──
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: normalise errors ──
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;

    let code = 'UNKNOWN';
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> = {};

    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? details;
    } else if (error.message) {
      message = error.message;
    }

    // On 401, clear token and redirect to login
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Only redirect if we're not already on /login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(new ApiError(code, message, status, details));
  },
);

export default api;
