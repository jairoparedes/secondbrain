/**
 * Tipos que reflejan los contratos del backend Laravel (Fase 1).
 * Mantener sincronizados con `backend/app/Domains/*` y con `docs/API.md`.
 */

export type User = {
  id: string;
  email: string;
  kdf_salt: string | null;
  master_key_wrapped: string | null;
  created_at: string | null;
};

export type Tag = {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
};

export type Note = {
  id: string;
  title_ciphertext: string | null;
  content_ciphertext: string;
  note_key_wrapped: string;
  iv: string;
  client_id: string | null;
  client_version: number | null;
  tag_ids: string[];
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

// ---------- Envoltorios ----------

export type ApiData<T> = { data: T };
export type ApiList<T> = {
  data: T[];
  meta: { page: number; per_page: number; total: number };
};

export type AuthResponse = {
  data: {
    user: User;
    token: string;
    token_type: 'Bearer';
  };
};

export type MeResponse = ApiData<User>;
export type NoteResponse = ApiData<Note>;
export type TagResponse = ApiData<Tag>;
export type NotesListResponse = ApiList<Note>;
export type TagsListResponse = { data: Tag[] };

// ---------- Payloads de entrada ----------

export type RegisterPayload = {
  email: string;
  password: string;
  kdf_salt?: string;
  master_key_wrapped?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type NotePayload = {
  title_ciphertext?: string | null;
  content_ciphertext: string;
  note_key_wrapped?: string;
  iv?: string;
  client_id?: string;
  client_version?: number;
  tag_ids?: string[];
};

export type NoteUpdatePayload = Partial<NotePayload>;

export type TagPayload = {
  name: string;
  color?: string;
};

// ---------- Formato de error del API ----------

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
};
