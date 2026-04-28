# API — Contratos vigentes

Base URL en desarrollo: `http://localhost/api`. Todos los endpoints
devuelven JSON.

## Convenciones

- **Auth**: `Authorization: Bearer <token-sanctum>` salvo endpoints
  públicos.
- **IDs**: UUID v4.
- **Errores**: formato uniforme
  ```json
  { "error": { "code": "...", "message": "...", "fields": { ... } } }
  ```
  con códigos `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401),
  `FORBIDDEN` (403), `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405),
  `HTTP_<code>` para el resto. `fields` solo aparece en errores de
  validación e indica el primer mensaje por campo.
- **Paginación**: `?page=1&per_page=25`, respuesta
  `{ data: [], meta: { page, per_page, total } }`.
- **Cifrado**: a partir de Fase 2, los campos `*_ciphertext` y `*_wrapped`
  son blobs base64 auto-contenidos (`iv || ct+tag`). Ver
  [`SECURITY.md`](SECURITY.md).

---

## Auth

| Método | Path                       | Auth | Descripción                                  |
|--------|----------------------------|------|----------------------------------------------|
| POST   | `/api/auth/register`       | —    | Crear cuenta + emite token Sanctum           |
| POST   | `/api/auth/login`          | —    | Login + emite token                          |
| POST   | `/api/auth/refresh`        | ✅   | Rota el token actual                         |
| POST   | `/api/auth/logout`         | ✅   | Revoca el token actual                       |
| GET    | `/api/auth/me`             | ✅   | Datos del usuario autenticado                |
| POST   | `/api/auth/change-password`| ✅   | Rota password + KEK (no toca notas)          |

### POST `/api/auth/register`

```json
{
  "email": "ana@ejemplo.com",
  "password": "secret1234",
  "kdf_salt": "base64...",
  "master_key_wrapped": "base64..."
}
```

`kdf_salt` y `master_key_wrapped` son opcionales por compatibilidad con
clientes legacy. La UI actual siempre los manda (los genera durante el
flujo `enrollUser` en el cliente).

**Respuesta `201`:**
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "ana@ejemplo.com",
      "kdf_salt": "base64...",
      "master_key_wrapped": "base64...",
      "created_at": "2026-04-27T22:00:00+00:00"
    },
    "token": "1|aBcDeF...",
    "token_type": "Bearer"
  }
}
```

### POST `/api/auth/login`

```json
{ "email": "ana@ejemplo.com", "password": "secret1234" }
```

Misma forma de respuesta que register.

### POST `/api/auth/change-password`

```json
{
  "current_password": "old-pwd",
  "new_password": "new-pwd-1234",
  "new_kdf_salt": "base64...",
  "new_master_key_wrapped": "base64..."
}
```

Efectos:
- Reemplaza `password`, `kdf_salt`, `master_key_wrapped` del usuario.
- **Revoca todos los demás tokens del usuario** (deja vivo solo el actual).
- Las notas no se tocan (ver `SECURITY.md` ADR-005).

Respuesta `200`:
```json
{ "data": { "message": "Contraseña actualizada. Las demás sesiones fueron cerradas." } }
```

---

## Notes

| Método | Path                          | Auth | Descripción                            |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/notes`                  | ✅   | Listar notas del usuario (paginadas)   |
| POST   | `/api/notes`                  | ✅   | Crear nota                             |
| GET    | `/api/notes/{id}`             | ✅   | Obtener una nota (incluye trashed)     |
| PUT    | `/api/notes/{id}`             | ✅   | Actualizar                             |
| DELETE | `/api/notes/{id}`             | ✅   | Mover a papelera (soft delete)         |
| POST   | `/api/notes/{id}/restore`     | ✅   | Restaurar desde papelera               |

### GET `/api/notes`

Query params: `page`, `per_page` (max 100), `trashed` (1 para listar
papelera).

Respuesta:
```json
{
  "data": [
    {
      "id": "uuid",
      "title_ciphertext": "base64 o texto plano si encryption_version=0",
      "content_ciphertext": "base64 o texto plano si encryption_version=0",
      "note_key_wrapped": "base64",
      "iv": "",
      "encryption_version": 1,
      "client_id": null,
      "client_version": 1,
      "tag_ids": ["uuid"],
      "created_at": "2026-04-22T00:49:36+00:00",
      "updated_at": "2026-04-22T00:49:36+00:00",
      "deleted_at": null
    }
  ],
  "meta": { "page": 1, "per_page": 25, "total": 1 }
}
```

### POST `/api/notes`

```json
{
  "title_ciphertext": "base64...",
  "content_ciphertext": "base64...",
  "note_key_wrapped": "base64...",
  "iv": "",
  "encryption_version": 1,
  "tag_ids": ["uuid", "..."]
}
```

`content_ciphertext` es el único campo obligatorio. `tag_ids` deben
pertenecer al usuario autenticado o se rechaza con 422.

### PUT `/api/notes/{id}`

Acepta los mismos campos como `sometimes`. Si se incluye `tag_ids`, se
sincroniza la tabla pivote (vacío = quitar todos los tags).

### DELETE `/api/notes/{id}` → 204
Soft delete. La nota desaparece del listado por defecto pero aparece
con `?trashed=1`.

### POST `/api/notes/{id}/restore` → 200
Quita el `deleted_at`.

---

## Tags

| Método | Path                | Auth | Descripción     |
|--------|---------------------|------|-----------------|
| GET    | `/api/tags`         | ✅   | Listar          |
| POST   | `/api/tags`         | ✅   | Crear           |
| DELETE | `/api/tags/{id}`    | ✅   | Eliminar        |

### POST `/api/tags`

```json
{ "name": "trabajo", "color": "#3b82f6" }
```

`name` único por usuario. `color` es regex `/^#?[0-9a-fA-F]{3,8}$/`.

---

## Search (pendiente, Fase 3)

| Método | Path             | Descripción                         |
|--------|------------------|-------------------------------------|
| GET    | `/api/search?q=` | Búsqueda por blind index / semántica|

Hoy responde 501 / no está implementado.

---

## Sync (pendiente, Fase 5)

| Método | Path                | Descripción                                    |
|--------|---------------------|------------------------------------------------|
| POST   | `/api/sync/push`    | Cliente envía eventos locales                  |
| GET    | `/api/sync/pull`    | Cliente recibe eventos desde `since=<cursor>`  |

Hoy responde 501.

---

## Healthcheck

```
GET /api/ping
{ "status": "ok", "service": "secondbrain-api", "time": "2026-04-27T22:00:00+00:00" }
```

Y el endpoint built-in de Laravel:
```
GET /up
```

---

## Códigos de error usados

| Código              | HTTP | Cuándo                                                      |
|---------------------|------|-------------------------------------------------------------|
| `VALIDATION_FAILED` | 422  | Falta un campo, formato inválido, unique violado.           |
| `UNAUTHENTICATED`   | 401  | Sin token o token inválido/revocado.                        |
| `FORBIDDEN`         | 403  | Token válido pero no permite la acción.                     |
| `NOT_FOUND`         | 404  | Recurso inexistente o no perteneciente al usuario.          |
| `METHOD_NOT_ALLOWED`| 405  | Verbo HTTP equivocado para la ruta.                         |
| `HTTP_<code>`       | varía| Cualquier otro error HTTP del framework.                    |
