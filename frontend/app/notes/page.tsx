import { NoteList } from '@/components/notes/NoteList';

export default function NotesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Mis notas</h1>
        <button
          disabled
          className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white opacity-50"
          title="Disponible en Fase 1"
        >
          Nueva nota
        </button>
      </header>
      <NoteList />
    </main>
  );
}
