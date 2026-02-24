import axios from 'axios';
import { LANGUAGE_STORAGE_KEY } from '../i18n/LanguageContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '../auth/storage';
import {
  createMockFeedbackPost,
  listMockFeedbackPosts,
  pinMockFeedbackPost,
  voteMockFeedbackPost,
} from './mockFeedbackStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
});

const FEEDBACK_BACKEND_MODE = String(import.meta.env.VITE_FEEDBACK_BACKEND || 'auto').toLowerCase();
let feedbackRuntimeSource = FEEDBACK_BACKEND_MODE === 'mock' ? 'mock-local' : 'live-api';

function currentLanguage() {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en';
  } catch {
    return 'en';
  }
}

function currentAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function currentAuthVoterId() {
  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) {
      return '';
    }

    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id);
    if (!id) {
      return '';
    }

    return `user:${id}`;
  } catch {
    return '';
  }
}

api.interceptors.request.use((config) => {
  const lang = currentLanguage();
  const params = config.params || {};
  const authToken = currentAuthToken();

  config.params = {
    ...params,
    lang,
  };

  if (authToken) {
    config.headers = {
      ...(config.headers || {}),
      Authorization: `Bearer ${authToken}`,
    };
  }

  if (config.method === 'post' && config.data && typeof config.data === 'object' && !Array.isArray(config.data)) {
    config.data = {
      ...config.data,
      language: config.data.language || lang,
    };
  }

  return config;
});

function shouldUseMockFallback(error) {
  if (!error) {
    return false;
  }

  if (!error.response) {
    return true;
  }

  const status = Number(error.response.status);
  return status === 404 || status >= 500;
}

export function getFeedbackRuntimeSource() {
  return feedbackRuntimeSource;
}

export async function fetchDashboardData() {
  const response = await api.get('/dashboard');
  return response.data.data;
}

export async function fetchRuntimeConfig() {
  const response = await api.get('/config');
  return response.data.data;
}

export async function fetchConsoleOverview() {
  const response = await api.get('/console/overview');
  return response.data.data;
}

export async function fetchLocations(includeRisk = false) {
  const response = await api.get('/locations', {
    params: includeRisk ? { includeRisk: 'true' } : undefined,
  });
  return response.data.data;
}

export async function fetchAnalytics(locationId, options = {}) {
  const response = await api.get(`/analytics/${locationId}`, {
    params: {
      month: options.month || undefined,
      window: options.window || undefined,
      refresh: options.refresh ? 'true' : undefined,
    },
  });
  return response.data.data;
}

export async function fetchRisk(locationId, refresh = false) {
  const response = await api.get(`/risk/${locationId}`, {
    params: refresh ? { refresh: 'true' } : undefined,
  });
  return response.data.data;
}

export async function fetchMitigation(locationId) {
  const response = await api.get(`/mitigation/${locationId}`);
  return response.data.data;
}

export async function fetchJudgeReport(locationId, refresh = false) {
  const response = await api.get('/report/judge', {
    params: {
      location_id: locationId || undefined,
      refresh: refresh ? 'true' : undefined,
    },
  });
  return response.data.data;
}

export async function askChatbot(payload) {
  const response = await api.post('/chat', payload);
  return response.data.data;
}

export async function signupUser(payload) {
  const response = await api.post('/auth/signup', payload);
  return response.data.data;
}

export async function loginUser(payload) {
  const response = await api.post('/auth/login', payload);
  return response.data.data;
}

export async function fetchAuthMe() {
  const response = await api.get('/auth/me');
  return response.data.data;
}

export async function fetchApiKeys() {
  const response = await api.get('/auth/api-keys');
  return response.data.data;
}

export async function createApiKey(payload) {
  const response = await api.post('/auth/api-keys', payload);
  return response.data.data;
}

export async function revokeApiKey(keyId) {
  const response = await api.delete(`/auth/api-keys/${keyId}`);
  return response.data.data;
}

export async function fetchFeedbackPosts({ limit = 60, voterId } = {}) {
  if (FEEDBACK_BACKEND_MODE === 'mock') {
    feedbackRuntimeSource = 'mock-local';
    return listMockFeedbackPosts({ limit, voterId });
  }

  try {
    const response = await api.get('/feedback/posts', {
      params: {
        limit,
        voter_id: voterId || undefined,
      },
    });
    feedbackRuntimeSource = 'live-api';
    return response.data.data;
  } catch (error) {
    if (FEEDBACK_BACKEND_MODE === 'auto' && shouldUseMockFallback(error)) {
      feedbackRuntimeSource = 'mock-fallback';
      return listMockFeedbackPosts({ limit, voterId });
    }
    throw error;
  }
}

export async function createFeedbackPost(payload) {
  if (FEEDBACK_BACKEND_MODE === 'mock') {
    feedbackRuntimeSource = 'mock-local';
    return createMockFeedbackPost(payload);
  }

  try {
    const response = await api.post('/feedback/posts', payload);
    feedbackRuntimeSource = 'live-api';
    return response.data.data;
  } catch (error) {
    if (FEEDBACK_BACKEND_MODE === 'auto' && shouldUseMockFallback(error)) {
      feedbackRuntimeSource = 'mock-fallback';
      return createMockFeedbackPost(payload);
    }
    throw error;
  }
}

export async function voteFeedbackPost(postId, payload) {
  const voterId = payload?.voter_id || currentAuthVoterId();
  const normalizedPayload = {
    ...payload,
    voter_id: voterId || undefined,
  };

  if (FEEDBACK_BACKEND_MODE === 'mock') {
    feedbackRuntimeSource = 'mock-local';
    return voteMockFeedbackPost(postId, normalizedPayload);
  }

  try {
    const response = await api.post(`/feedback/posts/${postId}/vote`, normalizedPayload);
    feedbackRuntimeSource = 'live-api';
    return response.data.data;
  } catch (error) {
    if (FEEDBACK_BACKEND_MODE === 'auto' && shouldUseMockFallback(error)) {
      feedbackRuntimeSource = 'mock-fallback';
      return voteMockFeedbackPost(postId, normalizedPayload);
    }
    throw error;
  }
}

export async function pinFeedbackPost(postId, pinned) {
  if (FEEDBACK_BACKEND_MODE === 'mock') {
    feedbackRuntimeSource = 'mock-local';
    return pinMockFeedbackPost(postId, pinned);
  }

  try {
    const response = await api.post(`/feedback/posts/${postId}/pin`, {
      pinned,
    });
    feedbackRuntimeSource = 'live-api';
    return response.data.data;
  } catch (error) {
    if (FEEDBACK_BACKEND_MODE === 'auto' && shouldUseMockFallback(error)) {
      feedbackRuntimeSource = 'mock-fallback';
      return pinMockFeedbackPost(postId, pinned);
    }
    throw error;
  }
}

export default api;
