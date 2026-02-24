import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchAuthMe,
  loginUser,
  signupUser,
} from '../api/client';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from './storage';

const AuthContext = createContext({
  token: null,
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

function readInitialToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readInitialUser() {
  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(token, user) {
  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }

    if (user) {
      window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  } catch {
    // ignore localStorage errors
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readInitialToken);
  const [user, setUser] = useState(readInitialUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!token) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const profile = await fetchAuthMe();
        if (!cancelled) {
          setUser(profile.user);
          persistSession(token, profile.user);
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          persistSession(null, null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function login(payload) {
    const response = await loginUser(payload);
    setToken(response.token);
    setUser(response.user);
    persistSession(response.token, response.user);
    return response;
  }

  async function signup(payload) {
    const response = await signupUser(payload);
    setToken(response.token);
    setUser(response.user);
    persistSession(response.token, response.user);
    return response;
  }

  function logout() {
    setToken(null);
    setUser(null);
    persistSession(null, null);
  }

  async function refreshUser() {
    if (!token) {
      return null;
    }
    const profile = await fetchAuthMe();
    setUser(profile.user);
    persistSession(token, profile.user);
    return profile.user;
  }

  const value = useMemo(() => ({
    token,
    user,
    loading,
    isAuthenticated: Boolean(token && user),
    login,
    signup,
    logout,
    refreshUser,
  }), [token, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
