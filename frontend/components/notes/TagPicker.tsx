'use client';

import { useState } from 'react';
import { tagsApi } from '@/services/api';
import type { Tag } from '@/types/api';

type Props = {
  availableTags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onTagsChanged?: (tags: Tag[]) => void;
};

export function TagPicker({
  availableTags,
  selectedIds,
  onChange,
  onTagsChanged,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const createTag = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const tag = await tagsApi.create({ name });
      onTagsChanged?.([...availableTags, tag]);
      onChange([...selectedIds, tag.id]);
      setNewName('');
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el tag');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {availableTags.length === 0 && !creating && (
          <span className="text-xs text-neutral-400">
            Aún no tenés tags.
          </span>
        )}

        {availableTags.map((t) => {
          const active = selectedIds.includes(t.id);
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => toggle(t.id)}
              className={
                'rounded-full border px-3 py-1 text-xs transition ' +
                (active
                  ? 'border-brand-500 bg-brand-600 text-white'
                  : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300')
              }
              style={
                active && t.color
                  ? { backgroundColor: t.color, borderColor: t.color }
                  : undefined
              }
              title={active ? 'Quitar tag' : 'Agregar tag'}
            >
              {t.name}
            </button>
          );
        })}

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:hover:border-neutral-500"
          >
            + nuevo tag
          </button>
        )}
      </div>

      {creating && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void createTag();
              } else if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder="Nombre del tag"
            autoFocus
            className="w-44 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-brand-500 dark:border-neutral-700"
          />
          <button
            type="button"
            onClick={() => void createTag()}
            className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-700"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName('');
              setError(null);
            }}
            className="rounded-md border border-neutral-200 px-3 py-1 text-xs transition hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
