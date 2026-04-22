'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppHeader } from '@/components/ui/AppHeader';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuth } from '@/stores/auth';
import { ApiError } from '@/services/api';

export default function RegisterPage() {
  useAuthGuard('guest');
  const router = useRouter();
  const register = useAuth((s) => s.register);
  const loading = useAuth((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    try {
      await register(email, password);
      router.replace('/notes');
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const perField: Record<string, string> = {};
        for (const key of Object.keys(err.fields)) {
          perField[key] = err.fields[key][0];
        }
        setFieldErrors(perField);
      } else if (err instanceof Error) {
        setFormError(err.message);
      }
    }
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-md flex-col justify-center px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Crear cuenta</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Tu contraseña nunca sale cifrada aún (Fase 2). Por ahora la app la usa
          para autenticarte contra la API.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-brand-500 dark:border-neutral-700"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-brand-500 dark:border-neutral-700"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
            )}
            <p className="mt-1 text-xs text-neutral-400">Mínimo 8 caracteres.</p>
          </label>

          {formError && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p className="text-center text-sm text-neutral-500">
            ¿Ya tenés cuenta?{' '}
            <Link
              href="/login"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Entrar
            </Link>
          </p>
        </form>
      </main>
    </>
  );
}
