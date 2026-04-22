import Link from 'next/link';
import { HealthBadge } from '@/components/ui/HealthBadge';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-start justify-center gap-10 px-6 py-20">
      <div>
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-brand-600">
          secondbrain · fase 0
        </p>
        <h1 className="text-5xl font-bold tracking-tight">
          Tu segundo cerebro, privado por diseño.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-500">
          Notas cifradas de extremo a extremo, búsqueda semántica y
          sincronización multidispositivo. Zero-knowledge real.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/notes"
          className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white transition hover:bg-brand-700"
        >
          Abrir mis notas
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-neutral-300 px-5 py-3 font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Entrar
        </Link>
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
        Esqueleto v0.1 · backend stubs devuelven 501 hasta la Fase 1.
      </footer>
    </main>
  );
}
