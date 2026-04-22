export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-bold">Entrar</h1>
      <p className="mb-6 text-sm text-neutral-500">
        El flujo real de auth llega en la Fase 1. Este formulario es un stub.
      </p>

      <form className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            placeholder="tu@correo.com"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-brand-500 dark:border-neutral-700"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-brand-500 dark:border-neutral-700"
          />
        </label>
        <button
          type="button"
          disabled
          className="w-full rounded-lg bg-brand-600 px-4 py-2 font-medium text-white opacity-50"
        >
          Entrar (Fase 1)
        </button>
      </form>
    </main>
  );
}
