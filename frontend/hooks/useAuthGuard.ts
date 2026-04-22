'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/stores/auth';

/**
 * Hidrata el estado desde localStorage (una sola vez) y redirige según el
 * modo pedido:
 *  - "protected": requiere sesión. Si no hay, manda a /login.
 *  - "guest":     sólo para usuarios sin sesión. Si ya hay, manda a /notes.
 *  - "public":    no redirige, sólo hidrata.
 *
 * Devuelve el status actual para permitir spinners mientras se decide.
 */
export function useAuthGuard(mode: 'protected' | 'guest' | 'public' = 'public') {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);
  const router = useRouter();

  useEffect(() => {
    if (status === 'idle') {
      hydrate();
    }
  }, [status, hydrate]);

  useEffect(() => {
    if (status === 'idle') return;

    if (mode === 'protected' && status === 'guest') {
      router.replace('/login');
    } else if (mode === 'guest' && status === 'authenticated') {
      router.replace('/notes');
    }
  }, [status, mode, router]);

  return status;
}
