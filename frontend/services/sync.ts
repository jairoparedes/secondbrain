/**
 * sync.ts
 *
 * Sincronización offline-first (Fase 5).
 * Stub funcional: define la forma del event log y el loop push/pull.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { api } from './api';

export type SyncEvent = {
  id: string;           // uuid local
  type:
    | 'note.created'
    | 'note.updated'
    | 'note.deleted'
    | 'tag.created'
    | 'tag.deleted';
  entity_id: string;
  payload?: unknown;
  client_id: string;
  timestamp: number;
  synced: 0 | 1;        // 0 = pendiente, 1 = confirmado por server
};

interface SBDB extends DBSchema {
  events: {
    key: string;
    value: SyncEvent;
    indexes: { 'by-synced': number };
  };
  cursor: {
    key: 'server_seq';
    value: number;
  };
}

let dbPromise: Promise<IDBPDatabase<SBDB>> | null = null;

function db(): Promise<IDBPDatabase<SBDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SBDB>('secondbrain', 1, {
      upgrade(db) {
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('by-synced', 'synced');
        db.createObjectStore('cursor');
      },
    });
  }
  return dbPromise;
}

export async function enqueue(event: Omit<SyncEvent, 'synced'>) {
  const d = await db();
  await d.put('events', { ...event, synced: 0 });
}

export async function pushChanges() {
  const d = await db();
  const pending = await d.getAllFromIndex('events', 'by-synced', 0);
  if (pending.length === 0) return;

  try {
    await api.post('/sync/push', { events: pending });
    const tx = d.transaction('events', 'readwrite');
    for (const ev of pending) {
      await tx.store.put({ ...ev, synced: 1 });
    }
    await tx.done;
  } catch (err) {
    // Fallo silencioso: reintentamos en el siguiente loop.
    console.warn('[sync] push falló, reintentando', err);
  }
}

export async function pullChanges() {
  const d = await db();
  const since = (await d.get('cursor', 'server_seq')) ?? 0;

  try {
    const res = await api.get<{
      data: SyncEvent[];
      meta: { cursor?: number };
    }>(`/sync/pull?since=${since}`);

    // TODO: aplicar res.data al estado local (notas/tags).

    if (res.meta?.cursor) {
      await d.put('cursor', res.meta.cursor, 'server_seq');
    }
  } catch (err) {
    console.warn('[sync] pull falló', err);
  }
}

export function startSyncLoop(intervalMs = 5000) {
  const tick = async () => {
    await pushChanges();
    await pullChanges();
  };

  const id = setInterval(() => {
    void tick();
  }, intervalMs);

  void tick();
  return () => clearInterval(id);
}
