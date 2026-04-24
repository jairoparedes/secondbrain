/**
 * Capa de orquestación que envuelve `notesApi` con cifrado zero-knowledge.
 *
 * Entrada/salida del punto de vista del UI: texto plano (title, content).
 * Lo que viaja al servidor: blobs base64 cifrados con la note_key, que a
 * su vez está envuelta con la master_key del usuario.
 *
 * Cada nota devuelta por el API puede venir en dos formatos:
 *   - encryption_version === 0: nota legada de Fase 1 (texto plano). Se
 *     muestra tal cual.
 *   - encryption_version >= 1:  nota cifrada. Se necesita la master_key.
 */

import { notesApi } from '@/services/api';
import {
  ENC_VERSION,
  decryptNote,
  encryptNote,
  reencryptNote,
} from '@/services/crypto';
import type { Note } from '@/types/api';

export type DecryptedNote = Omit<Note, 'title_ciphertext' | 'content_ciphertext'> & {
  title: string | null;
  content: string;
  is_legacy: boolean;
  decrypt_error: string | null;
};

/** Toma una Note cruda del API y la convierte en una DecryptedNote,
 * usando la master_key cuando haga falta. Si algo falla al descifrar
 * (p. ej. master_key errónea o blob corrupto), devuelve la nota con
 * `decrypt_error` seteado para que la UI muestre un aviso en vez de
 * romper. */
async function decryptOne(
  n: Note,
  masterKey: CryptoKey | null,
): Promise<DecryptedNote> {
  const base = {
    id: n.id,
    note_key_wrapped: n.note_key_wrapped,
    iv: n.iv,
    encryption_version: n.encryption_version,
    client_id: n.client_id,
    client_version: n.client_version,
    tag_ids: n.tag_ids,
    created_at: n.created_at,
    updated_at: n.updated_at,
    deleted_at: n.deleted_at,
  };

  if (!n.encryption_version || n.encryption_version === 0) {
    return {
      ...base,
      title: n.title_ciphertext,
      content: n.content_ciphertext,
      is_legacy: true,
      decrypt_error: null,
    };
  }

  if (!masterKey) {
    return {
      ...base,
      title: null,
      content: '',
      is_legacy: false,
      decrypt_error:
        'La bóveda está bloqueada. Ingresá tu contraseña para leer esta nota.',
    };
  }

  try {
    const { title, content } = await decryptNote(
      n.title_ciphertext,
      n.content_ciphertext,
      n.note_key_wrapped,
      masterKey,
    );
    return {
      ...base,
      title,
      content,
      is_legacy: false,
      decrypt_error: null,
    };
  } catch (err) {
    return {
      ...base,
      title: null,
      content: '',
      is_legacy: false,
      decrypt_error:
        err instanceof Error ? err.message : 'Error al descifrar la nota.',
    };
  }
}

export const notesCrypto = {
  async list(
    masterKey: CryptoKey | null,
    params?: { page?: number; per_page?: number; trashed?: boolean },
  ): Promise<{
    data: DecryptedNote[];
    meta: { page: number; per_page: number; total: number };
  }> {
    const raw = await notesApi.list(params);
    const data = await Promise.all(
      raw.data.map((n) => decryptOne(n, masterKey)),
    );
    return { data, meta: raw.meta };
  },

  async create(
    masterKey: CryptoKey,
    payload: {
      title: string;
      content: string;
      tag_ids?: string[];
    },
  ): Promise<DecryptedNote> {
    const enc = await encryptNote(payload.title, payload.content, masterKey);
    const created = await notesApi.create({
      title_ciphertext: enc.title_ciphertext,
      content_ciphertext: enc.content_ciphertext,
      note_key_wrapped: enc.note_key_wrapped,
      iv: enc.iv,
      encryption_version: enc.encryption_version,
      tag_ids: payload.tag_ids,
    });
    // El backend devuelve los blobs; los desciframos de vuelta para mantener
    // la UI reactiva sin una round-trip adicional.
    return decryptOne(created, masterKey);
  },

  async update(
    masterKey: CryptoKey,
    id: string,
    existingNoteKeyWrapped: string,
    payload: {
      title: string;
      content: string;
      tag_ids?: string[];
    },
  ): Promise<DecryptedNote> {
    const enc = await reencryptNote(
      payload.title,
      payload.content,
      existingNoteKeyWrapped,
      masterKey,
    );
    const updated = await notesApi.update(id, {
      title_ciphertext: enc.title_ciphertext,
      content_ciphertext: enc.content_ciphertext,
      note_key_wrapped: enc.note_key_wrapped,
      iv: enc.iv,
      encryption_version: enc.encryption_version,
      tag_ids: payload.tag_ids,
    });
    return decryptOne(updated, masterKey);
  },

  remove: (id: string) => notesApi.remove(id),
  restore: async (masterKey: CryptoKey | null, id: string) => {
    const restored = await notesApi.restore(id);
    return decryptOne(restored, masterKey);
  },

  ENC_VERSION,
};
