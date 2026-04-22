'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Note = {
  id: string;
  title_ciphertext: string | null;
  updated_at: string;
};

export function NoteList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ data: Note[] }>('/notes')
      .then((res) => {
        if (cancelled) return;
        setNotes(res.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? 'Error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-neutral-500">Cargando notas...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        <strong>Error al consultar la API:</strong> {error}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">
        Aún no tienes notas. La creación estará disponible en la Fase 1.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li
          key={note.id}
          className="rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
        >
          <p className="text-xs text-neutral-400">
            #{note.id.slice(0, 8)} · {new Date(note.updated_at).toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            (contenido cifrado — se descifra localmente con tu master key)
          </p>
        </li>
      ))}
    </ul>
  );
}
