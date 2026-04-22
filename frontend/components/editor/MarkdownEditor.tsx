'use client';

import { useState } from 'react';

type Props = {
  initialValue?: string;
  onChange?: (value: string) => void;
};

/**
 * Editor mínimo (textarea). En Fase 6 se reemplaza por TipTap o similar.
 * En Fase 2 el onChange pasa por crypto.encrypt antes de salir del componente.
 */
export function MarkdownEditor({ initialValue = '', onChange }: Props) {
  const [value, setValue] = useState(initialValue);

  return (
    <textarea
      className="h-full w-full resize-none rounded-lg border border-neutral-300 bg-transparent p-4 font-mono text-sm outline-none focus:border-brand-500 dark:border-neutral-700"
      value={value}
      placeholder="Empieza a escribir..."
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e.target.value);
      }}
    />
  );
}
