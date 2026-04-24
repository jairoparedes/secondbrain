'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/ui/AppHeader';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { TagPicker } from '@/components/notes/TagPicker';
import { UnlockDialog } from '@/components/ui/UnlockDialog';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuth } from '@/stores/auth';
import { useCrypto } from '@/stores/crypto';
import { tagsApi } from '@/services/api';
import { notesCrypto, type DecryptedNote } from '@/services/notesCrypto';
import type { Tag } from '@/types/api';

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; id: string };

export default function NotesPage() {
  const status = useAuthGuard('protected');
  const masterKey = useCrypto((s) => s.masterKey);
  const vaultLocked = useCrypto((s) => s.locked);
  const kdfSalt = useCrypto((s) => s.kdfSalt);
  const user = useAuth((s) => s.user);

  // Mostrar el unlock sólo si el usuario REALMENTE tiene bóveda
  // (kdf_salt guardado). Si no la tiene, es un legado Fase 1 y seguimos
  // operando sin cifrado.
  const userHasVault = !!(kdfSalt && user?.master_key_wrapped);
  const showUnlock =
    status === 'authenticated' && vaultLocked && userHasVault;

  const [notes, setNotes] = useState<DecryptedNote[]>([]);
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
        notesCrypto.list(masterKey, { per_page: 100, trashed: showTrashed }),
        tagsApi.list(),
      ]);
      setNotes(noteRes.data);
      setTags(tagList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [showTrashed, masterKey]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (showUnlock) return; // esperamos a que el usuario desbloquee
    void reload();
  }, [status, reload, showUnlock]);

  // Búsqueda local sobre el texto ya descifrado. En Fase 3 se añadirá
  // blind index + full-text cifrado en IndexedDB.
  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.toLowerCase();
    return notes.filter((n) =>
      ((n.title ?? '') + ' ' + (n.content ?? '')).toLowerCase().includes(q),
    );
  }, [notes, query]);

  // ---------- handlers ----------
  const openCreate = () => {
    setEditorTagIds([]);
    setView({ kind: 'create' });
  };

  const openEdit = (note: DecryptedNote) => {
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
    if (!masterKey) {
      setError('La bóveda está bloqueada. Desbloqueala para guardar.');
      return;
    }
    setEditorSaving(true);
    setError(null);
    try {
      if (view.kind === 'create') {
        await notesCrypto.create(masterKey, {
          title,
          content,
          tag_ids: editorTagIds,
        });
      } else if (view.kind === 'edit' && editingNote) {
        await notesCrypto.update(masterKey, editingNote.id, editingNote.note_key_wrapped, {
          title,
          content,
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
      await notesCrypto.remove(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await notesCrypto.restore(masterKey, id);
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
      {showUnlock && <UnlockDialog />}
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
  notes: DecryptedNote[];
  tags: Tag[];
  loading: boolean;
  error: string | null;
  query: string;
  onQuery: (s: string) => void;
  showTrashed: boolean;
  onToggleTrashed: () => void;
  onNew: () => void;
  onEdit: (n: DecryptedNote) => void;
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
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            Mis notas
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              zero-knowledge
            </span>
          </h1>
          <p className="text-sm text-neutral-500">
            {showTrashed
              ? 'Mostrando notas en la papelera.'
              : `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'} activas · cifradas en tu dispositivo.`}
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
            placeholder="Buscar en tus notas (sobre texto ya descifrado)…"
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
                  {note.decrypt_error
                    ? '🔒 Nota cifrada'
                    : note.title || 'Sin título'}
                </h3>
                <div className="flex shrink-0 items-center gap-2">
                  {note.is_legacy && (
                    <span
                      className="rounded-sm bg-amber-500/10 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400"
                      title="Creada antes del cifrado E2E"
                    >
                      legada
                    </span>
                  )}
                  {!note.is_legacy && !note.decrypt_error && (
                    <span
                      className="rounded-sm bg-emerald-500/10 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                      title={`Cifrado AES-256-GCM · v${note.encryption_version}`}
                    >
                      e2e
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                    {note.updated_at
                      ? new Date(note.updated_at).toLocaleDateString()
                      : ''}
                  </span>
                </div>
              </div>

              {note.decrypt_error ? (
                <p className="mb-3 text-xs text-neutral-500">
                  {note.decrypt_error}
                </p>
              ) : (
                <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
                  {note.content || '(vacía)'}
                </p>
              )}

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
                      disabled={!!note.decrypt_error}
                      className="rounded-md border border-neutral-200 px-2 py-1 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
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
        {showTrashed ? 'La papelera está vacía.' : 'Todavía no tenés notas.'}
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
  note: DecryptedNote | null;
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
              : note?.title || 'Sin título'}
          </h1>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            Tu texto se cifra en este navegador antes de salir hacia el servidor.
          </p>
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
        initialTitle={note?.title ?? ''}
        initialContent={note?.content ?? ''}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
      />
    </div>
  );
}
