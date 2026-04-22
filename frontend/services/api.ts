/**
 * Cliente HTTP tipado contra la API Laravel.
 * - El token se toma de localStorage en la key `sb.token` (guardado por el store de auth).
 * - Todas las respuestas de error siguen el contrato { error: { code, message, fields? } }.
 */

import type {
  AuthResponse,
  LoginPayload,
  MeResponse,
  Note,
  NotePayload,
  NoteResponse,
  NoteUpdatePayload,
  NotesListResponse,
  RegisterPayload,
  Tag,
  TagPayload,
  TagResponse,
  TagsListResponse,
  User,
} from '@/types/api';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost/api';

export const TOKEN_STORAGE_KEY = 'sb.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensaje legible para un campo específico, útil para formularios. */
  fieldError(name: string): string | undefined {
    return this.fields?.[name]?.[0];
  }
}

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  const isBodyless = init.method === undefined || init.method === 'GET';

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(isBodyless ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (res.status === 204) {
    // No Content
    return undefined as T;
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(
      err.message ?? `HTTP ${res.status}`,
      res.status,
      err.code,
      err.fields,
    );
  }

  return body as T;
}

// ---------- Primitivas ----------

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

// ---------- API de alto nivel ----------

export const authApi = {
  register: (payload: RegisterPayload) =>
    api.post<AuthResponse>('/auth/register', payload),

  login: (payload: LoginPayload) =>
    api.post<AuthResponse>('/auth/login', payload),

  me: () => api.get<MeResponse>('/auth/me').then((r) => r.data as User),

  refresh: () =>
    api.post<{ data: { token: string; token_type: 'Bearer' } }>('/auth/refresh', {}),

  logout: () => api.post<{ data: { message: string } }>('/auth/logout', {}),
};

export const notesApi = {
  list: (params?: { page?: number; per_page?: number; trashed?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    if (params?.trashed) qs.set('trashed', '1');
    const q = qs.toString();
    return api.get<NotesListResponse>(`/notes${q ? '?' + q : ''}`);
  },

  get: (id: string) =>
    api.get<NoteResponse>(`/notes/${id}`).then((r) => r.data as Note),

  create: (payload: NotePayload) =>
    api.post<NoteResponse>('/notes', payload).then((r) => r.data as Note),

  update: (id: string, payload: NoteUpdatePayload) =>
    api.put<NoteResponse>(`/notes/${id}`, payload).then((r) => r.data as Note),

  remove: (id: string) => api.delete(`/notes/${id}`),

  restore: (id: string) =>
    api.post<NoteResponse>(`/notes/${id}/restore`, {}).then((r) => r.data as Note),
};

export const tagsApi = {
  list: () =>
    api.get<TagsListResponse>('/tags').then((r) => r.data ?? []),

  create: (payload: TagPayload) =>
    api.post<TagResponse>('/tags', payload).then((r) => r.data as Tag),

  remove: (id: string) => api.delete(`/tags/${id}`),
};
