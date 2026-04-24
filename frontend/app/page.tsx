'use client';

import Link from 'next/link';
import { AppHeader } from '@/components/ui/AppHeader';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuth } from '@/stores/auth';

export default function HomePage() {
  useAuthGuard('public');
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-4xl flex-col items-start justify-center gap-10 px-6 py-20">
        <div>
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-brand-600">
            secondbrain · fase 2
          </p>
          <h1 className="text-5xl font-bold tracking-tight">
            Tu segundo cerebro, privado por diseño.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-neutral-500">
            Notas cifradas de extremo a extremo con AES-256-GCM, clave derivada
            con Argon2id en tu dispositivo. El servidor nunca ve tu texto.
          </p>
          <div className="mt-4 inline-flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              zero-knowledge activo
            </span>
            <span className="text-neutral-500">
              AES-256-GCM · Argon2id (t=3, m=64MiB)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {status === 'authenticated' ? (
            <>
              <Link
                href="/notes"
                className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white transition hover:bg-brand-700"
              >
                Ir a mis notas
              </Link>
              <span className="self-center text-sm text-neutral-500">
                Sesión: <strong>{user?.email}</strong>
              </span>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white transition hover:bg-brand-700"
              >
                Crear cuenta
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-neutral-300 px-5 py-3 font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Entrar
              </Link>
            </>
          )}
        </div>

        <section className="w-full rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
          <h2 className="text-sm font-semibold uppercase text-neutral-500">
            Estado del sistema
          </h2>
          <div className="mt-3">
            <HealthBadge />
          </div>
        </section>

        <footer className="mt-auto text-xs text-neutral-400">
          v0.3 · Fase 2: cifrado E2E con Argon2id + AES-256-GCM · 32 tests backend.
        </footer>
      </main>
    </>
  );
}
