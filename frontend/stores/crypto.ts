'use client';

/**
 * Store de la master_key del usuario.
 *
 * Propiedad crítica: la master_key NUNCA se persiste. Vive solo en
 * memoria del tab y se pierde al recargar, al cerrar sesión y al
 * "bloquear" la app manualmente. Eso es lo que hace que el modelo
 * zero-knowledge tenga sentido: un backup del localStorage no alcanza
 * para leer notas.
 */

import { create } from 'zustand';

type CryptoState = {
  masterKey: CryptoKey | null;
  kdfSalt: string | null;
  masterKeyWrapped: string | null; // blob envuelto que guarda el server
  locked: boolean;

  setMasterKey: (
    key: CryptoKey,
    kdfSalt: string,
    masterKeyWrapped: string,
  ) => void;
  rememberVaultMeta: (kdfSalt: string, masterKeyWrapped: string) => void;
  lock: () => void;
  clear: () => void;
};

export const useCrypto = create<CryptoState>((set) => ({
  masterKey: null,
  kdfSalt: null,
  masterKeyWrapped: null,
  locked: true,

  setMasterKey: (key, kdfSalt, masterKeyWrapped) =>
    set({ masterKey: key, kdfSalt, masterKeyWrapped, locked: false }),

  rememberVaultMeta: (kdfSalt, masterKeyWrapped) =>
    set({ kdfSalt, masterKeyWrapped }),

  lock: () => set({ masterKey: null, locked: true }),

  clear: () =>
    set({
      masterKey: null,
      kdfSalt: null,
      masterKeyWrapped: null,
      locked: true,
    }),
}));

/** Helper para código fuera de React: exige que la bóveda esté abierta. */
export function requireMasterKey(): CryptoKey {
  const key = useCrypto.getState().masterKey;
  if (!key) {
    throw new Error(
      'La bóveda está bloqueada. Desbloqueá con tu contraseña antes de continuar.',
    );
  }
  return key;
}
