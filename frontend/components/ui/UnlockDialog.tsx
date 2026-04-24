'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/stores/auth';

/**
 * Modal bloqueante que pide la password para re-derivar la master_key
 * tras un reload. Se muestra cuando hay token en localStorage pero la
 * master_key vive solo en memoria y ya se perdió.
 */
export function UnlockDialog() {
  const unlock = useAuth((s) => s.unlock);
  const logout = useAuth((s) => s.logout);
  const loading = useAuth((s) => s.loading);
  const user = useAuth((s) => s.user);
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await unlock(password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desbloquear');
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-4 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-4 flex items-start gap-3">
          <div
            className="mt-1 h-8 w-8 flex-shrink-0 rounded-lg bg-brand-600/10 text-brand-600"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-full w-full p-1.5"
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Desbloquear bóveda</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Tus notas están cifradas de extremo a extremo. Ingresá tu
              contraseña para re-derivar tu clave maestra en este dispositivo.
            </p>
            {user && (
              <p className="mt-2 text-xs text-neutral-400">
                Sesión activa: <strong>{user.email}</strong>
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-brand-500 dark:border-neutral-700"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Descifrando clave…' : 'Desbloquear'}
          </button>

          <p className="pt-2 text-center text-xs text-neutral-400">
            La derivación usa Argon2id; puede tomar ~1s.
          </p>

          <button
            type="button"
            onClick={handleSwitchAccount}
            className="w-full text-center text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Cerrar sesión y usar otra cuenta
          </button>
        </form>
      </div>
    </div>
  );
}
