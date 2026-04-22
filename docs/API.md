# API — Contratos iniciales

Base URL: `http://localhost/api` (dev) · todos los endpoints devuelven JSON.

> Estado: **stubs**. La mayoría de endpoints devuelven `501 Not Implemented` en esta fase.

## Convenciones

- **Auth**: `Authorization: Bearer <jwt>` salvo endpoints públicos.
- **IDs**: UUID v4 en todos los recursos.
- **Errores**: formato `{ "error": { "code": "...", "message": "..." } }` con status HTTP apropiado.
- **Paginación**: `?page=1&per_page=25`, respuesta `{ data: [], meta: { page, per_page, total } }`.

## Auth

| Método | Path                 | Descripción                           |
|--------|----------------------|---------------------------------------|
| POST   | `/api/auth/register` | Crear cuenta (envía `kdf_salt`)       |
| POST   | `/api/auth/login`    | Obtener JWT + refresh                 |
| POST   | `/api/auth/refresh`  | Renovar JWT                           |
| POST   | `/api/auth/logout`   | Invalidar refresh token               |
| GET    | `/api/auth/me`       | Datos del usuario autenticado         |

### POST /api/auth/register

Request:
```json
{
  "email": "jane@example.com",
  "password_hash": "argon2id$...",
  "kdf_salt": "base64...",
  "master_key_wrapped": "base64..."
}
```

## Notes

| Método | Path                   | Descripción                  |
|--------|------------------------|------------------------------|
| GET    | `/api/notes`           | Listar notas (paginadas)     |
| POST   | `/api/notes`           | Crear nota cifrada           |
| GET    | `/api/notes/{id}`      | Obtener una nota             |
| PUT    | `/api/notes/{id}`      | Actualizar nota              |
| DELETE | `/api/notes/{id}`      | Mover a papelera (soft)      |
| POST   | `/api/notes/{id}/restore` | Restaurar desde papelera |

### POST /api/notes

```json
{
  "title_ciphertext": "base64...",
  "content_ciphertext": "base64...",
  "note_key_wrapped": "base64...",
  "iv": "base64...",
  "blind_indexes": ["base64...", "..."],
  "tag_ids": ["uuid", "..."]
}
```

## Tags

| Método | Path                   | Descripción |
|--------|------------------------|-------------|
| GET    | `/api/tags`            | Listar      |
| POST   | `/api/tags`            | Crear       |
| DELETE | `/api/tags/{id}`       | Eliminar    |

## Search

| Método | Path             | Descripción                         |
|--------|------------------|-------------------------------------|
| GET    | `/api/search?q=` | Búsqueda por blind index / semántica|

## Sync

| Método | Path                | Descripción                                    |
|--------|---------------------|------------------------------------------------|
| POST   | `/api/sync/push`    | Cliente envía eventos locales                  |
| GET    | `/api/sync/pull`    | Cliente recibe eventos desde `since=<cursor>`  |

### Formato de evento

```json
{
  "id": "uuid",
  "type": "note.created|note.updated|note.deleted|tag.created|...",
  "entity_id": "uuid",
  "payload": { ... },
  "client_id": "uuid",
  "timestamp": 1730000000
}
```
