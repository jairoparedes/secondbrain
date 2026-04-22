'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/ui/AppHeader';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { TagPicker } from '@/components/notes/TagPicker';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { notesApi, tagsApi } from '@/services/api';
import { renderMarkdown } from '@/lib/markdown';
import type { Note, Tag } from '@/types/api';

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; id: string };

export default function NotesPage() {
  const status = useAuthGuard('protected');

  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [query, setQuery] = useState('');
  const [showTrashed, setShowTrashed] = useState(false);

  const [editorTagIds, setEditorTagIds] = useState<string[]>([]);
  const [editorSaving, setEditorSaving] = useState(false);

  const editingNote = useMemo(
    () => (view.kind === 'edit' ? notes.find((n) => n.id === view.id) : null),
    [view, notes],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noteRes, tagList] = await Promise.all([
        notesApi.list({ per_page: 100, trashed: showTrashed }),
        tagsApi.list(),
      ]);
      setNotes(noteRes.data);
      setTags(tagList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [showTrashed]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void reload();
  }, [status, reload]);

  // Filtro por texto: como el contenido aún no está cifrado (fase 1),
  // hacemos match local sobre title/content_ciphertext (tratados como texto plano).
  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.toLowerCase();
    return notes.filter((n) =>
      ((n.title_ciphertext ?? '') + ' ' + (n.content_ciphertext ?? ''))
        .toLowerCase()
        .includes(q),
    );
  }, [notes, query]);

  // ---------- handlers ----------
  const openCreate = () => {
    setEditorTagIds([]);
    setView({ kind: 'create' });
  };

  const openEdit = (note: Note) => {
    setEditorTagIds(note.tag_ids ?? []);
    setView({ kind: 'edit', id: note.id });
  };

  const closeEditor = () => setView({ kind: 'list' });

  const handleSave = async ({
    title,
    content,
  }: {
    title: string;
    content: string;
  }) => {
    setEditorSaving(true);
    try {
      if (view.kind === 'create') {
        await notesApi.create({
          title_ciphertext: title || null,
          content_ciphertext: content,
          tag_ids: editorTagIds,
        });
      } else if (view.kind === 'edit') {
        await notesApi.update(view.id, {
          title_ciphertext: title || null,
          content_ciphertext: content,
          tag_ids: editorTagIds,
        });
      }
      await reload();
      setView({ kind: 'list' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Mover esta nota a la papelera?')) return;
    try {
      await notesApi.remove(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await notesApi.restore(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al restaurar');
    }
  };

  // ---------- render ----------
  if (status !== 'authenticated') {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-5xl px-6 py-10 text-neutral-500">
          Redirigiendo…
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {view.kind === 'list' ? (
          <ListView
            notes={filtered}
            tags={tags}
            loading={loading}
            error={error}
            query={query}
            onQuery={setQuery}
            showTrashed={showTrashed}
            onToggleTrashed={() => setShowTrashed((v) => !v)}
            onNew={openCreate}
            onEdit={openEdit}
            onDelete={handleDelete}
            onRestore={handleRestore}
          />
        ) : (
          <EditorView
            mode={view.kind}
            note={editingNote ?? null}
            tags={tags}
            selectedTagIds={editorTagIds}
            onTagIdsChange={setEditorTagIds}
            onTagsChanged={setTags}
            saving={editorSaving}
            onSave={handleSave}
            onCancel={closeEditor}
          />
        )}
      </main>
    </>
  );
}

// =================================================================
// List view
// =================================================================

function ListView(props: {
  notes: Note[];
  tags: Tag[];
  loading: boolean;
  error: string | null;
  query: string;
  onQuery: (s: string) => void;
  showTrashed: boolean;
  onToggleTrashed: () => void;
  onNew: () => void;
  onEdit: (n: Note) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const {
    notes,
    tags,
    loading,
    error,
    query,
    onQuery,
    showTrashed,
    onToggleTrashed,
    onNew,
    onEdit,
    onDelete,
    onRestore,
  } = props;

  const tagsById = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  );

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis notas</h1>
          <p className="text-sm text-neutral-500">
            {showTrashed
              ? 'Mostrando notas en la papelera.'
              : `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'} activas.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleTrashed}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm transition hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            {showTrashed ? 'Ver activas' : 'Ver papelera'}
          </button>
          {!showTrashed && (
            <button
              type="button"
              onClick={onNew}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Nueva nota
            </button>
          )}
        </div>
      </header>

      {!showTrashed && (
        <div className="mb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar en tus notas…"
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-brand-500 dark:border-neutral-700"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : notes.length === 0 ? (
        <EmptyState onNew={onNew} showTrashed={showTrashed} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group rounded-xl border border-neutral-200 p-4 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 font-semibold">
                  {note.title_ciphertext || 'Sin título'}
                </h3>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-neutral-400">
                  {note.updated_at
                    ? new Date(note.updated_at).toLocaleDateString()
                    : ''}
                </span>
              </div>

              <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
                {note.content_ciphertext || '(vacía)'}
              </p>

              {note.tag_ids && note.tag_ids.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {note.tag_ids
                    .map((id) => tagsById[id])
                    .filter(Boolean)
                    .map((t) => (
                      <span
                        key={t!.id}
                        className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                        style={
                          t!.color
                            ? {
                                borderColor: t!.color,
                                color: t!.color,
                              }
                            : undefined
                        }
                      >
                        {t!.name}
                      </span>
                    ))}
                </div>
              )}

              <div className="flex gap-2 text-xs">
                {showTrashed ? (
                  <button
                    type="button"
                    onClick={() => onRestore(note.id)}
                    className="rounded-md border border-neutral-200 px-2 py-1 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    Restaurar
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(note)}
                      className="rounded-md border border-neutral-200 px-2 py-1 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(note.id)}
                      className="rounded-md border border-transparent px-2 py-1 text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EmptyState({
  onNew,
  showTrashed,
}: {
  onNew: () => void;
  showTrashed: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
      <p className="text-neutral-500">
        {showTrashed
          ? 'La papelera está vacía.'
          : 'Todavía no tenés notas.'}
      </p>
      {!showTrashed && (
        <button
          type="button"
          onClick={onNew}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Crear tu primera nota
        </button>
      )}
    </div>
  );
}

// =================================================================
// Editor view
// =================================================================

function EditorView(props: {
  mode: 'create' | 'edit';
  note: Note | null;
  tags: Tag[];
  selectedTagIds: string[];
  onTagIdsChange: (ids: string[]) => void;
  onTagsChanged: (tags: Tag[]) => void;
  saving: boolean;
  onSave: (data: { title: string; content: string }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const {
    mode,
    note,
    tags,
    selectedTagIds,
    onTagIdsChange,
    onTagsChanged,
    saving,
    onSave,
    onCancel,
  } = props;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-400">
            {mode === 'create' ? 'Nueva nota' : 'Editar'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === 'create'
              ? 'Crear una nota'
              : note?.title_ciphertext || 'Sin título'}
          </h1>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          ← Volver
        </button>
      </header>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Tags
        </p>
        <TagPicker
          availableTags={tags}
          selectedIds={selectedTagIds}
          onChange={onTagIdsChange}
          onTagsChanged={onTagsChanged}
        />
      </div>

      <NoteEditor
        initialTitle={note?.title_ciphertext ?? ''}
        initialContent={note?.content_ciphertext ?? ''}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
      />
    </div>
  );
}
