'use client';

import { create } from 'zustand';
import { ApiError, TOKEN_STORAGE_KEY, authApi } from '@/services/api';
import type { User } from '@/types/api';

const USER_STORAGE_KEY = 'sb.user';

type Status = 'idle' | 'authenticated' | 'guest';

type AuthState = {
  status: Status;
  user: User | null;
  token: string | null;
  error: string | null;
  loading: boolean;

  hydrate: () => void;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

function readStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else if (typeof value === 'string') {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* quota / private mode */
  }
}

export const useAuth = create<AuthState>((set) => ({
  status: 'idle',
  user: null,
  token: null,
  error: null,
  loading: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const user = readStorage<User>(USER_STORAGE_KEY);
    set({
      token,
      user,
      status: token && user ? 'authenticated' : 'guest',
    });
  },

  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.register({ email, password });
      writeStorage(TOKEN_STORAGE_KEY, res.data.token);
      writeStorage(USER_STORAGE_KEY, res.data.user);
      set({
        token: res.data.token,
        user: res.data.user,
        status: 'authenticated',
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Error de red',
      });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.login({ email, password });
      writeStorage(TOKEN_STORAGE_KEY, res.data.token);
      writeStorage(USER_STORAGE_KEY, res.data.user);
      set({
        token: res.data.token,
        user: res.data.user,
        status: 'authenticated',
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Error de red',
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Si el token ya no es válido, seguimos limpiando el estado local.
    } finally {
      writeStorage(TOKEN_STORAGE_KEY, null);
      writeStorage(USER_STORAGE_KEY, null);
      set({ token: null, user: null, status: 'guest', error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
