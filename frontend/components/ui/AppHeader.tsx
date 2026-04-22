'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/stores/auth';

export function AppHeader() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const logout = useAuth((s) => s.logout);
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-lg bg-brand-600" aria-hidden />
          <span className="font-semibold tracking-tight">Second Brain</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {status === 'authenticated' && (
            <>
              <Link
                href="/notes"
                className="rounded-md px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
              >
                Mis notas
              </Link>
              <span className="mx-2 hidden text-xs text-neutral-400 sm:inline">
                {user?.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Salir
              </button>
            </>
          )}

          {status === 'guest' && (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white transition hover:bg-brand-700"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
