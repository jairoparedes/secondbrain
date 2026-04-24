'use client';

import { create } from 'zustand';
import { ApiError, TOKEN_STORAGE_KEY, authApi } from '@/services/api';
import {
  enrollUser,
  unlockMasterKey,
} from '@/services/crypto';
import { useCrypto } from '@/stores/crypto';
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
  unlock: (password: string) => Promise<void>;
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

/** Recuerda en el store de crypto los metadatos de la bóveda del usuario
 * (kdf_salt, master_key_wrapped) para poder re-desbloquear tras un
 * reload sin volver a pasar por /auth/me. */
function rememberVaultMeta(user: User | null) {
  if (!user) return;
  if (user.kdf_salt && user.master_key_wrapped) {
    useCrypto.getState().rememberVaultMeta(
      user.kdf_salt,
      user.master_key_wrapped,
    );
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
    if (token && user) {
      rememberVaultMeta(user);
    }
    set({
      token,
      user,
      status: token && user ? 'authenticated' : 'guest',
    });
  },

  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      // 1. Derivar KEK + generar master_key local.
      const { masterKey, bundle } = await enrollUser(password);

      // 2. Registrar en el backend enviando la metadata de cifrado.
      const res = await authApi.register({
        email,
        password,
        kdf_salt: bundle.kdf_salt,
        master_key_wrapped: bundle.master_key_wrapped,
      });

      // 3. Guardar el token y bootstrap de la sesión.
      writeStorage(TOKEN_STORAGE_KEY, res.data.token);
      writeStorage(USER_STORAGE_KEY, res.data.user);
      useCrypto.getState().setMasterKey(
        masterKey,
        bundle.kdf_salt,
        bundle.master_key_wrapped,
      );
      set({
        token: res.data.token,
        user: res.data.user,
        status: 'authenticated',
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Error al registrar',
      });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.login({ email, password });

      // Si el usuario ya tenía metadata de cifrado (creó cuenta con Fase 2),
      // desbloqueamos la master_key acá mismo. Usuarios legacy (Fase 1 sin
      // kdf_salt ni master_key_wrapped) quedan autenticados pero con
      // bóveda vacía — pueden seguir operando con notas plaintext legadas.
      const u = res.data.user;
      if (u.kdf_salt && u.master_key_wrapped) {
        const masterKey = await unlockMasterKey(
          password,
          u.kdf_salt,
          u.master_key_wrapped,
        );
        useCrypto.getState().setMasterKey(
          masterKey,
          u.kdf_salt,
          u.master_key_wrapped,
        );
      } else {
        useCrypto.getState().clear();
      }

      writeStorage(TOKEN_STORAGE_KEY, res.data.token);
      writeStorage(USER_STORAGE_KEY, u);
      set({
        token: res.data.token,
        user: u,
        status: 'authenticated',
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Error al entrar',
      });
      throw err;
    }
  },

  /** Re-abre la bóveda tras un reload (sin volver a crear sesión). */
  unlock: async (password) => {
    set({ loading: true, error: null });
    try {
      const { kdfSalt, masterKeyWrapped } = useCrypto.getState();
      if (!kdfSalt || !masterKeyWrapped) {
        throw new Error('No hay metadata de cifrado para esta cuenta.');
      }
      const masterKey = await unlockMasterKey(
        password,
        kdfSalt,
        masterKeyWrapped,
      );
      useCrypto.getState().setMasterKey(
        masterKey,
        kdfSalt,
        masterKeyWrapped,
      );
      set({ loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Contraseña incorrecta',
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* token inválido: seguimos limpiando local */
    } finally {
      writeStorage(TOKEN_STORAGE_KEY, null);
      writeStorage(USER_STORAGE_KEY, null);
      useCrypto.getState().clear();
      set({ token: null, user: null, status: 'guest', error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
