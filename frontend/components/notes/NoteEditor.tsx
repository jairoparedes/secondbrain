'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderMarkdown } from '@/lib/markdown';

type Props = {
  initialTitle?: string;
  initialContent?: string;
  onSave: (data: { title: string; content: string }) => Promise<void> | void;
  onCancel?: () => void;
  saving?: boolean;
};

export function NoteEditor({
  initialTitle = '',
  initialContent = '',
  onSave,
  onCancel,
  saving = false,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');

  useEffect(() => setTitle(initialTitle), [initialTitle]);
  useEffect(() => setContent(initialContent), [initialContent]);

  const html = useMemo(() => renderMarkdown(content || ''), [content]);
  const dirty = title !== initialTitle || content !== initialContent;

  const handleKey = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter → guardar
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void onSave({ title, content });
    }
  };

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKey}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la nota"
        className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-lg font-semibold outline-none focus:border-brand-500 dark:border-neutral-700"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-lg border border-neutral-200 p-0.5 text-xs dark:border-neutral-800">
          {(['edit', 'split', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                'rounded-md px-2.5 py-1 transition ' +
                (mode === m
                  ? 'bg-brand-600 text-white'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200')
              }
            >
              {m === 'edit' ? 'Editar' : m === 'split' ? 'Dividido' : 'Vista'}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-400">
          Markdown · Ctrl/⌘+Enter para guardar
        </span>
      </div>

      <div
        className={
          mode === 'split'
            ? 'grid min-h-[360px] grid-cols-2 gap-3'
            : 'min-h-[360px]'
        }
      >
        {mode !== 'preview' && (
          <textarea
            className="h-full min-h-[360px] w-full resize-none rounded-lg border border-neutral-300 bg-transparent p-3 font-mono text-sm leading-relaxed outline-none focus:border-brand-500 dark:border-neutral-700"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# Mi primera nota&#10;&#10;Escribí aquí. Acepta Markdown básico."
          />
        )}
        {mode !== 'edit' && (
          <div
            className="markdown-preview min-h-[360px] overflow-auto rounded-lg border border-neutral-200 bg-white/40 p-4 text-sm leading-relaxed dark:border-neutral-800 dark:bg-neutral-950/40"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave({ title, content })}
          disabled={saving || (!dirty && initialContent !== '')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
