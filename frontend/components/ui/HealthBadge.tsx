'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Status = 'loading' | 'ok' | 'down';

export function HealthBadge() {
  const [status, setStatus] = useState<Status>('loading');
  const [detail, setDetail] = useState<string>('Consultando...');

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ status: string; service: string; time: string }>('/ping')
      .then((data) => {
        if (cancelled) return;
        setStatus('ok');
        setDetail(`${data.service} · ${data.time}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('down');
        setDetail(err.message ?? 'No disponible');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const color =
    status === 'ok'
      ? 'bg-emerald-500'
      : status === 'down'
        ? 'bg-red-500'
        : 'bg-neutral-400 animate-pulse';

  return (
    <div className="flex items-center gap-3">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <div className="text-sm">
        <span className="font-medium">
          {status === 'ok' ? 'API conectada' : status === 'down' ? 'API caída' : 'Verificando'}
        </span>
        <span className="ml-2 text-neutral-500">{detail}</span>
      </div>
    </div>
  );
}
